import os
import requests
import datetime

# --- Configuration ---
# You can set this in your terminal: export MASSIVE_API_KEY="your_key"
API_KEY = os.environ.get("MASSIVE_API_KEY", "YOUR_API_KEY_HERE")
TICKER = "SPY"
# Note: Update this base URL to match the exact endpoint provided in Massive's documentation
BASE_URL = "https://api.massive.com/v3" 

def get_0dte_date():
    """Returns today's date, or Monday if today is the weekend (since options don't expire on weekends)."""
    today = datetime.datetime.today()
    if today.weekday() >= 5: # 5=Sat, 6=Sun
        today += datetime.timedelta(days=(7 - today.weekday()))
    return today.strftime('%Y-%m-%d')

def fetch_options_data(ticker, expiration_date):
    """
    Fetches the options chain for a given ticker and expiration date.
    Replace the endpoint path with the exact Massive API path.
    """
    url = f"{BASE_URL}/snapshot/options/{ticker}"
    params = {
        "expiration_date": expiration_date,
        "apiKey": API_KEY,
        "limit": 250
    }
    
    print(f"Fetching data for {ticker} on {expiration_date}...")
    
    all_results = []
    while url:
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            print(f"Error fetching data: {response.status_code} - {response.text}")
            break
            
        data = response.json()
        all_results.extend(data.get("results", []))
        
        url = data.get("next_url")
        params = {"apiKey": API_KEY} # Keep API key for subsequent requests
        
    return {"results": all_results}

def calculate_gex(options_data):
    """
    Calculates 0DTE Gamma Exposure (GEX).
    Formula: 
    Call GEX = Gamma * Open Interest * 100 * Spot Price
    Put GEX = -Gamma * Open Interest * 100 * Spot Price
    """
    total_gex = 0.0
    strike_gex = {}
    
    results = options_data.get("results", [])
    if not results:
        print("No results found in API response.")
        return total_gex, strike_gex, 0.0
        
    # Get spot price from the first contract's underlying asset data
    spot_price = results[0].get("underlying_asset", {}).get("price", 0.0)
    
    for item in results:
        details = item.get("details", {})
        contract_type = details.get("contract_type", "").lower()
        strike = details.get("strike_price", 0.0)
        
        greeks = item.get("greeks") or {}
        gamma = greeks.get("gamma") or 0.0
        oi = item.get("open_interest", 0)
        
        if contract_type == "call":
            gex = gamma * oi * 100 * spot_price
        elif contract_type == "put":
            gex = -gamma * oi * 100 * spot_price
        else:
            continue
            
        total_gex += gex
        strike_gex[strike] = strike_gex.get(strike, 0) + gex
        
    return total_gex, strike_gex, spot_price

if __name__ == "__main__":
    print(f"--- Starting 0DTE GEX Calculation for {TICKER} ---")
    today = get_0dte_date()
    print(f"0DTE Expiration Date: {today}")
    
    if API_KEY == "YOUR_API_KEY_HERE":
        print("\n[WARNING] Please set your MASSIVE_API_KEY environment variable!")
        # We exit early so we don't spam the API with bad auth
        exit(1)
        
    data = fetch_options_data(TICKER, today)
    
    if data:
        total_gex, gex_by_strike, spot_price = calculate_gex(data)
        
        if spot_price > 0:
            print(f"Current Spot Price: {spot_price}")
            print(f"\nTotal 0DTE GEX for {TICKER}: {total_gex:,.2f}")
        
        print("\nGEX by Strike (Top 5 Positive and Top 5 Negative):")
        sorted_strikes = sorted(gex_by_strike.items(), key=lambda item: item[1])
        print("Most Negative Strikes:")
        for strike, gex in sorted_strikes[:5]:
            print(f"Strike {strike}: {gex:,.2f}")
            
        print("\nMost Positive Strikes:")
        for strike, gex in sorted_strikes[-5:]:
            print(f"Strike {strike}: {gex:,.2f}")
