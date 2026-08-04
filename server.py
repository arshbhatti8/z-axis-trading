import os
import requests
import datetime
import asyncio
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
        
        if contract_type == "call":
            gex = gamma * oi * 100 * spot_price
        elif contract_type == "put":
            gex = -gamma * oi * 100 * spot_price
        else:
            continue
            
        total_gex += gex
        strike_gex[strike] = strike_gex.get(strike, 0) + gex
        
    return total_gex, strike_gex, spot_price

def get_gex_payload(ticker: str):
    today = get_0dte_date()
    data = fetch_options_data(ticker, today)
    if not data:
        return {"error": "Invalid API key or data not found"}
        
    total_gex, gex_by_strike, spot_price = calculate_gex(data)
    
    sorted_strikes = sorted(gex_by_strike.items(), key=lambda item: item[1])
    most_negative = [{"strike": k, "gex": v} for k, v in sorted_strikes[:5]]
    most_positive = [{"strike": k, "gex": v} for k, v in sorted_strikes[-5:]]
    
    return {
        "ticker": ticker,
        "expiration_date": today,
        "spot_price": spot_price,
        "total_gex": total_gex,
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
