import os
import requests
import datetime
import asyncio
import math
import yfinance as yf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any

# --- Configuration ---
API_KEY = os.environ.get("MASSIVE_API_KEY", "YOUR_API_KEY_HERE")
BASE_URL = "https://api.massive.com/v3" 

app = FastAPI(title="GEX Data API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

def get_0dte_date():
    today = datetime.datetime.today()
    if today.weekday() >= 5: # 5=Sat, 6=Sun
        today += datetime.timedelta(days=(7 - today.weekday()))
    return today.strftime('%Y-%m-%d')

def fetch_options_data(ticker: str, expiration_date: str):
    if API_KEY == "YOUR_API_KEY_HERE":
        return None
        
    url = f"{BASE_URL}/snapshot/options/{ticker}"
    params = {
        "expiration_date": expiration_date,
        "apiKey": API_KEY,
        "limit": 250
    }
    
    all_results = []
    while url:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            break
            
        data = response.json()
        all_results.extend(data.get("results", []))
        
        url = data.get("next_url")
        params = {"apiKey": API_KEY}
        
    return {"results": all_results}

def norm_pdf(x):
    return math.exp(-x**2 / 2.0) / math.sqrt(2 * math.pi)

def bs_gamma(S, K, T, r, sigma):
    if T <= 0.0001 or sigma <= 0.0001 or S <= 0: 
        return 0.0
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
        return norm_pdf(d1) / (S * sigma * math.sqrt(T))
    except Exception:
        return 0.0

def calculate_gex(options_data):
    total_gex = 0.0
    strike_gex = {}
    
    results = options_data.get("results", [])
    if not results:
        return total_gex, strike_gex, 0.0
        
    spot_price = results[0].get("underlying_asset", {}).get("price", 0.0)
    
    for item in results:
        details = item.get("details", {})
        contract_type = details.get("contract_type", "").lower()
        strike = details.get("strike_price", 0.0)
        
        greeks = item.get("greeks") or {}
        gamma = greeks.get("gamma") or 0.0
        oi = item.get("open_interest", 0)
        
        # Step 1: Scaling to 1% move -> Spot_Price^2 * 0.01
        scaling_factor = (spot_price ** 2) * 0.01
        
        # Step 3: Dealer positioning
        if contract_type == "call":
            gex = gamma * oi * 100 * scaling_factor
        elif contract_type == "put":
            gex = -gamma * oi * 100 * scaling_factor
        else:
            continue
            
        total_gex += gex
        strike_gex[strike] = strike_gex.get(strike, 0) + gex
        
    return total_gex, strike_gex, spot_price

def calculate_zero_gamma_level(options_data, current_spot):
    results = options_data.get("results", [])
    if not results or current_spot <= 0:
        return None
        
    # Simulate spot price moving from -10% to +10% in 0.5% increments
    min_spot = current_spot * 0.90
    max_spot = current_spot * 1.10
    step = current_spot * 0.005
    
    options = []
    
    try:
        exp_date_str = results[0].get("details", {}).get("expiration_date")
        exp_date = datetime.datetime.strptime(exp_date_str, "%Y-%m-%d").date()
        today = datetime.datetime.today().date()
        days_to_expiry = (exp_date - today).days
        T = max(days_to_expiry / 365.0, 0.001)
    except:
        T = 0.001
        
    for item in results:
        details = item.get("details", {})
        ctype = details.get("contract_type", "").lower()
        if ctype not in ("call", "put"): continue
            
        strike = details.get("strike_price", 0.0)
        greeks = item.get("greeks") or {}
        iv = greeks.get("implied_volatility") or 0.20 # Fallback to 20% IV
        oi = item.get("open_interest", 0)
        
        sign = 1 if ctype == "call" else -1
        options.append({"strike": strike, "iv": iv, "oi": oi, "sign": sign})
        
    spot_levels = []
    gex_levels = []
    
    test_spot = min_spot
    while test_spot <= max_spot:
        total_gex = 0.0
        scaling = (test_spot ** 2) * 0.01
        
        for opt in options:
            gamma = bs_gamma(test_spot, opt["strike"], T, 0.02, opt["iv"])
            total_gex += gamma * opt["oi"] * 100 * scaling * opt["sign"]
            
        spot_levels.append(test_spot)
        gex_levels.append(total_gex)
        test_spot += step
        
    zero_gamma = None
    for i in range(1, len(gex_levels)):
        # Look for the crossover point
        if (gex_levels[i-1] < 0 and gex_levels[i] >= 0) or (gex_levels[i-1] > 0 and gex_levels[i] <= 0):
            y1, y2 = gex_levels[i-1], gex_levels[i]
            x1, x2 = spot_levels[i-1], spot_levels[i]
            if y2 - y1 != 0:
                zero_gamma = x1 - y1 * (x2 - x1) / (y2 - y1)
            else:
                zero_gamma = x1
            break
            
    return round(zero_gamma, 2) if zero_gamma else None

def get_gex_payload(ticker: str):
    today = get_0dte_date()
    data = fetch_options_data(ticker, today)
    if not data:
        return {"error": "Invalid API key or data not found"}
        
    total_gex, gex_by_strike, spot_price = calculate_gex(data)
    zero_gamma = calculate_zero_gamma_level(data, spot_price)
    
    sorted_strikes = sorted(gex_by_strike.items(), key=lambda item: item[1])
    most_negative = [{"strike": k, "gex": v} for k, v in sorted_strikes[:5]]
    most_positive = [{"strike": k, "gex": v} for k, v in sorted_strikes[-5:]]
    
    return {
        "ticker": ticker,
        "expiration_date": today,
        "spot_price": spot_price,
        "total_gex": total_gex,
        "zero_gamma": zero_gamma,
        "most_negative": most_negative,
        "most_positive": most_positive
    }

@app.get("/api/gex/{ticker}")
def get_gex(ticker: str):
    """REST endpoint to fetch GEX data for a ticker"""
    payload = get_gex_payload(ticker.upper())
    return payload

@app.websocket("/ws/gex/{ticker}")
async def websocket_gex(websocket: WebSocket, ticker: str):
    """WebSocket endpoint to stream GEX data periodically"""
    await manager.connect(websocket)
    ticker = ticker.upper()
    try:
        while True:
            # Fetch and send data
            payload = get_gex_payload(ticker)
            await websocket.send_json(payload)
            
            # Wait 60 seconds before next update to avoid rate limits
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        manager.disconnect(websocket)

@app.get("/api/history/{ticker}")
def get_history(ticker: str):
    """Fallback REST endpoint to fetch recent minute-by-minute data from Yahoo Finance"""
    try:
        ticker_obj = yf.Ticker(ticker.upper())
        df = ticker_obj.history(period="1d", interval="1m")
        if df.empty:
            return {"error": "No data found", "data": []}
        
        data = []
        for index, row in df.iterrows():
            data.append({
                "time": int(index.timestamp()),
                "open": row["Open"],
                "high": row["High"],
                "low": row["Low"],
                "close": row["Close"],
                "volume": int(row["Volume"])
            })
        return {"data": data}
    except Exception as e:
        return {"error": str(e), "data": []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
