import os
import time
import requests
import datetime
import asyncio
import math
import argparse
import sys
import yfinance as yf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from dotenv import load_dotenv
import db

load_dotenv()

# --- Configuration ---
parser = argparse.ArgumentParser()
parser.add_argument("--log-level", default="info", choices=["info", "debug"])
args, _ = parser.parse_known_args()
LOG_LEVEL = args.log_level

API_KEY = os.environ.get("MASSIVE_API_KEY", "YOUR_API_KEY_HERE")
BASE_URL = "https://api.massive.com/v3" 

app = FastAPI(title="GEX Data API")
SERVER_START_TIME = time.time()

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
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, ticker: str):
        await websocket.accept()
        if ticker not in self.active_connections:
            self.active_connections[ticker] = []
        self.active_connections[ticker].append(websocket)

    def disconnect(self, websocket: WebSocket, ticker: str):
        if ticker in self.active_connections and websocket in self.active_connections[ticker]:
            self.active_connections[ticker].remove(websocket)

    async def broadcast(self, message: dict, ticker: str):
        if ticker in self.active_connections:
            for connection in self.active_connections[ticker]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()
latest_gex_payloads = {}
active_tickers = {"SPY", "QQQ", "SPX"}
daily_open_gex = {} # Format: {"YYYY-MM-DD": {"SPY": {500: 1000, 505: -2000}}}

async def background_gex_polling():
    while True:
        # Create a list copy to safely iterate while it might be modified
        tickers_to_track = list(active_tickers)
        for ticker in tickers_to_track:
            try:
                payload = await asyncio.to_thread(get_gex_payload, ticker)
                if payload and "error" not in payload:
                    latest_gex_payloads[ticker] = payload
                    await asyncio.to_thread(db.save_gex_payload, ticker, payload)
                    await manager.broadcast(payload, ticker)
            except Exception as e:
                if LOG_LEVEL == "debug":
                    print(f"Error in background GEX poll for {ticker}: {e}")
        
        # Wait 5 seconds before next polling cycle
        await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(background_gex_polling())

def get_0dte_date():
    today = datetime.datetime.today()
    if today.weekday() >= 5: # 5=Sat, 6=Sun
        today += datetime.timedelta(days=(7 - today.weekday()))
    return today.strftime('%Y-%m-%d')

def fetch_options_data(ticker: str, expiration_date: str, snapshot_date: str = None):
    if API_KEY == "YOUR_API_KEY_HERE":
        return None
        
    url = f"{BASE_URL}/snapshot/options/{ticker}"
    params = {
        "expiration_date": expiration_date,
        "apiKey": API_KEY,
        "limit": 250
    }
    if snapshot_date:
        params["date"] = snapshot_date
        
    all_results = []
    while url:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            break
            
        data = response.json()
        if LOG_LEVEL == "debug":
            print(f"Massive API Response: {data}")
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
    strike_premium = {}
    
    results = options_data.get("results", [])
    if not results:
        return total_gex, strike_gex, 0.0, strike_premium
        
    spot_price = results[0].get("underlying_asset", {}).get("price", 0.0)
    
    # Fallback for index tickers like SPX that don't return spot price in the snapshot
    if spot_price == 0.0:
        try:
            ticker_symbol = results[0].get("details", {}).get("ticker", "")
            if "SPX" in ticker_symbol:
                lookup_ticker = "SPX"
            elif "NDX" in ticker_symbol:
                lookup_ticker = "NDX"
            else:
                lookup_ticker = ticker_symbol.split(":")[1][:3] if ":" in ticker_symbol else "SPY"
                
            tradier_key = os.environ.get("VITE_TRADIER_API_KEY")
            if tradier_key:
                res = requests.get(
                    f"https://api.tradier.com/v1/markets/quotes?symbols={lookup_ticker}",
                    headers={"Authorization": f"Bearer {tradier_key}", "Accept": "application/json"}
                )
                if res.status_code == 200:
                    quote_data = res.json().get("quotes", {}).get("quote", {})
                    if isinstance(quote_data, dict) and "last" in quote_data:
                        spot_price = float(quote_data["last"])
            
            # If tradier fails or is not configured, we still have yfinance imported as backup
            if spot_price == 0.0:
                yf_ticker = "^" + lookup_ticker if lookup_ticker in ["SPX", "NDX"] else lookup_ticker
                history = yf.Ticker(yf_ticker).history(period="1d")
                if not history.empty:
                    spot_price = history["Close"].iloc[-1]
        except Exception as e:
            if LOG_LEVEL == "debug":
                print(f"Failed to fetch fallback spot price: {e}")
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
        contract_type = details.get("contract_type", "").lower()
        strike = details.get("strike_price", 0.0)
        
        greeks = item.get("greeks") or {}
        gamma = greeks.get("gamma") or 0.0
        iv = greeks.get("implied_volatility") or 0.20
        
        if gamma == 0.0 and spot_price > 0:
            gamma = bs_gamma(spot_price, strike, T, 0.02, iv)
            
        oi = item.get("open_interest", 0)
        
        # Step 1: Scaling to 1% move -> Spot_Price^2 * 0.01
        scaling_factor = (spot_price ** 2) * 0.01
        
        day_close = item.get("day", {}).get("close")
        if day_close is None:
            day_close = details.get("last_price", 0)
        premium = day_close * oi * 100
        
        if strike not in strike_premium:
            strike_premium[strike] = {"call_premium": 0.0, "put_premium": 0.0}
            
        # Step 3: Dealer positioning
        if contract_type == "call":
            gex = gamma * oi * 100 * scaling_factor
            strike_premium[strike]["call_premium"] += premium
        elif contract_type == "put":
            gex = -gamma * oi * 100 * scaling_factor
            strike_premium[strike]["put_premium"] += premium
        else:
            continue
            
        total_gex += gex
        strike_gex[strike] = strike_gex.get(strike, 0) + gex
        
    return total_gex, strike_gex, spot_price, strike_premium

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

def get_gex_payload(ticker: str, snapshot_date: str = None):
    today = get_0dte_date()
    # For backfilling in this environment, always use the current 0DTE (Aug 7) as expiration
    data = fetch_options_data(ticker, today, snapshot_date)
    
    # Fallback to nearest Friday for non-daily tickers
    if (not data or not data.get("results")) and ticker.upper() not in ["SPY", "QQQ", "SPX", "IWM"]:
        today_dt = datetime.datetime.strptime(today, "%Y-%m-%d")
        days_to_friday = (4 - today_dt.weekday()) % 7
        if days_to_friday > 0:
            next_friday = today_dt + datetime.timedelta(days=days_to_friday)
            next_friday_str = next_friday.strftime('%Y-%m-%d')
            fallback_data = fetch_options_data(ticker, next_friday_str)
            if fallback_data and fallback_data.get("results"):
                today = next_friday_str
                data = fallback_data

    if not data or not data.get("results"):
        return {"error": "Invalid API key or data not found"}
        
    total_gex, gex_by_strike, spot_price, strike_premium = calculate_gex(data)
    zero_gamma = calculate_zero_gamma_level(data, spot_price)
    
    today_str = snapshot_date if snapshot_date else get_0dte_date()
    
    if today_str not in daily_open_gex:
        daily_open_gex[today_str] = {}
        
    if ticker not in daily_open_gex[today_str]:
        open_data = db.get_open_gex_for_date(ticker, today_str)
        if open_data:
            daily_open_gex[today_str][ticker] = open_data
        else:
            daily_open_gex[today_str][ticker] = dict(gex_by_strike)
            
    open_gex_cache = daily_open_gex[today_str][ticker]

    sorted_strikes = sorted(gex_by_strike.items(), key=lambda item: item[1])
    most_negative = []
    most_positive = []
    
    for k, v in sorted_strikes:
        open_val = open_gex_cache.get(k, 0)
        pct_change = 0.0
        if open_val != 0:
            pct_change = ((v - open_val) / abs(open_val)) * 100.0
            
        item = {"strike": k, "gex": v, "open_gex_pct": round(pct_change, 2)}
        if v < 0:
            most_negative.append(item)
        else:
            most_positive.append(item)
    
    premium_data = [
        {"strike": k, "call_premium": v["call_premium"], "put_premium": v["put_premium"]}
        for k, v in strike_premium.items()
    ]
    premium_data.sort(key=lambda x: x["call_premium"] + x["put_premium"], reverse=True)
    
    return {
        "ticker": ticker,
        "expiration_date": today,
        "spot_price": spot_price,
        "total_gex": total_gex,
        "zero_gamma": zero_gamma,
        "most_negative": most_negative,
        "most_positive": most_positive,
        "premium_data": premium_data
    }

@app.get("/api/gex/{ticker}")
def get_gex(ticker: str, date: str = None):
    """REST endpoint to fetch GEX data for a ticker"""
    payload = get_gex_payload(ticker.upper(), date)
    if date and "error" not in payload:
        # Save it to the database so it shows up in history!
        # Use noon UTC for historical backfill
        db.save_gex_payload(ticker.upper(), payload, f"{date} 12:00:00")
    return payload

@app.get("/api/health")
def get_health():
    total_connections = sum(len(conns) for conns in manager.active_connections.values())
    uptime_seconds = time.time() - SERVER_START_TIME
    
    # Calculate connection breakdown
    conn_breakdown = {}
    for ticker, conns in manager.active_connections.items():
        if conns:
            conn_breakdown[ticker] = len(conns)
            
    return {
        "status": "online",
        "uptime_seconds": uptime_seconds,
        "active_tickers_polling": list(active_tickers),
        "total_websocket_connections": total_connections,
        "connections_by_ticker": conn_breakdown
    }

@app.get("/api/history/gex/{ticker}")
def get_historical_gex(ticker: str, date: str = None):
    """REST endpoint to fetch historical intraday GEX data for playback"""
    return db.get_historical_gex(ticker.upper(), date)

@app.websocket("/ws/gex/{ticker}")
async def websocket_gex(websocket: WebSocket, ticker: str):
    """WebSocket endpoint to stream GEX data periodically"""
    ticker = ticker.upper()
    active_tickers.add(ticker)
    await manager.connect(websocket, ticker)
    
    if ticker in latest_gex_payloads:
        await websocket.send_json(latest_gex_payloads[ticker])
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, ticker)
    except Exception:
        manager.disconnect(websocket, ticker)

@app.websocket("/ws/anomalous/{ticker}")
async def websocket_anomalous(websocket: WebSocket, ticker: str):
    """WebSocket endpoint to stream anomalous trades"""
    await manager.connect(websocket)
    ticker = ticker.upper()
    tradier_key = os.environ.get("VITE_TRADIER_API_KEY")
    
    async def poll_anomalous():
        while True:
            try:
                if not tradier_key:
                    # Mock data
                    mock_trade = {
                        "type": "anomalous_trade",
                        "ticker": ticker,
                        "size": 15000,
                        "price": 150.0,
                        "time": datetime.datetime.now().isoformat()
                    }
                    await websocket.send_json(mock_trade)
                    await asyncio.sleep(5)
                else:
                    try:
                        start = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M")
                        url = f"https://api.tradier.com/v1/markets/timesales?symbol={ticker}&interval=tick&start={start}"
                        headers = {"Authorization": f"Bearer {tradier_key}", "Accept": "application/json"}
                        
                        response = await asyncio.to_thread(requests.get, url, headers=headers)
                        if response.status_code == 200:
                            data = response.json()
                            series = data.get("series", {}).get("data", [])
                            if isinstance(series, dict):
                                series = [series]
                            
                            for trade in series:
                                if trade.get("volume", 0) > 10000:
                                    anomalous = {
                                        "type": "anomalous_trade",
                                        "ticker": ticker,
                                        "size": trade.get("volume"),
                                        "price": trade.get("price", 0.0),
                                        "time": trade.get("timestamp") or trade.get("time")
                                    }
                                    await websocket.send_json(anomalous)
                    except Exception:
                        pass
                    await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
            except Exception:
                pass
            
            # just in case it breaks from the inner sleeps
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            
    polling_task = asyncio.create_task(poll_anomalous())
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        polling_task.cancel()
        manager.disconnect(websocket)

def get_tradier_history(ticker: str, interval: str, tradier_token: str):
    headers = {"Authorization": f"Bearer {tradier_token}", "Accept": "application/json"}
    is_intraday = interval in ["1m", "5m", "15m", "30m", "1h"]
    
    if is_intraday:
        t_interval = "15min"
        if interval == "1m": t_interval = "1min"
        elif interval == "5m": t_interval = "5min"
        
        start = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=5)).strftime("%Y-%m-%d %H:%M")
        url = f"https://api.tradier.com/v1/markets/timesales?symbol={ticker}&interval={t_interval}&start={start}"
    else:
        t_interval = "daily"
        if interval == "1W": t_interval = "weekly"
        elif interval == "1M": t_interval = "monthly"
        url = f"https://api.tradier.com/v1/markets/history?symbol={ticker}&interval={t_interval}"
        
    try:
        res = requests.get(url, headers=headers, timeout=5)
        res.raise_for_status()
    except Exception as e:
        print(f"Tradier API request failed: {e}")
        raise ValueError(f"Tradier API request failed: {e}")
        
    data = res.json()
    if LOG_LEVEL == "debug":
        print(f"Tradier API Response: {data}")
    
    formatted_data = []
    if is_intraday:
        series_obj = data.get("series") or {}
        series = series_obj.get("data", [])
        if isinstance(series, dict): series = [series]
        for d in series:
            formatted_data.append({
                "time": d["timestamp"],
                "open": d["open"], "high": d["high"], "low": d["low"], "close": d["close"], "volume": d.get("volume", 0)
            })
    else:
        history_obj = data.get("history") or {}
        history = history_obj.get("day", [])
        if isinstance(history, dict): history = [history]
        for d in history:
            dt = datetime.datetime.strptime(d["date"], "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
            formatted_data.append({
                "time": int(dt.timestamp()),
                "open": d["open"], "high": d["high"], "low": d["low"], "close": d["close"], "volume": d.get("volume", 0)
            })
            
    if not formatted_data:
        raise ValueError("Empty data from Tradier")
        
    if interval in ["30m", "1h"]:
        tf_seconds = 1800 if interval == "30m" else 3600
        aggregated = []
        current = None
        for d in formatted_data:
            b_time = d["time"] - (d["time"] % tf_seconds)
            if not current or current["time"] != b_time:
                if current: aggregated.append(current)
                current = {"time": b_time, "open": d["open"], "high": d["high"], "low": d["low"], "close": d["close"], "volume": d["volume"]}
            else:
                current["high"] = max(current["high"], d["high"])
                current["low"] = min(current["low"], d["low"])
                current["close"] = d["close"]
                current["volume"] += d["volume"]
        if current: aggregated.append(current)
        formatted_data = aggregated
        
    return formatted_data

@app.get("/api/history/{ticker}")
def get_history(ticker: str, interval: str = "1m", tradier_token: str = None):
    """REST endpoint to fetch historical data from Tradier or Yahoo Finance for a given timeframe"""
    
    if tradier_token:
        try:
            tradier_data = get_tradier_history(ticker, interval, tradier_token)
            return {"data": tradier_data, "source": "tradier"}
        except Exception as e:
            print(f"Tradier history failed, falling back to Yahoo Finance: {e}")
            
    try:
        # Map TradingView-style timeframes to yfinance compatible periods/intervals
        if interval == "1m":
            period, yf_interval = "7d", "1m"
        elif interval in ["5m", "15m", "30m"]:
            period, yf_interval = "60d", interval
        elif interval == "1h":
            period, yf_interval = "730d", "60m"
        elif interval == "1D":
            period, yf_interval = "max", "1d"
        elif interval == "1W":
            period, yf_interval = "max", "1wk"
        elif interval == "1M":
            period, yf_interval = "max", "1mo"
        else:
            period, yf_interval = "7d", "1m"
            
        ticker_obj = yf.Ticker(ticker.upper())
        df = ticker_obj.history(period=period, interval=yf_interval)
        if LOG_LEVEL == "debug":
            print(f"Yahoo Finance DataFrame:\n{df}")
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
        return {"data": data, "source": "yahoo"}
    except Exception as e:
        return {"error": str(e), "data": []}

app.mount("/", StaticFiles(directory="dist", html=True), name="static")

@app.exception_handler(404)
async def custom_404_handler(request, __):
    return FileResponse("dist/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
