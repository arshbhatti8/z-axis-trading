import sqlite3
import json
import os
import datetime

def get_db_path(date_str: str = None):
    if not date_str:
        date_str = datetime.datetime.now().strftime('%Y-%m-%d')
    return os.environ.get("DB_PATH", f"options_history_{date_str}.db")

def get_connection(date_str: str = None):
    db_path = get_db_path(date_str)
    return sqlite3.connect(db_path)

def init_db(date_str: str = None):
    conn = get_connection(date_str)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS gex_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            spot_price REAL,
            total_gex REAL,
            zero_gamma REAL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS strike_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gex_history_id INTEGER,
            strike REAL,
            gex REAL,
            call_premium REAL,
            put_premium REAL,
            FOREIGN KEY(gex_history_id) REFERENCES gex_history(id)
        )
    ''')
    
    # Create indexes for faster queries
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_gex_ticker_time ON gex_history (ticker, timestamp)')
    
    conn.commit()
    conn.close()

def save_gex_payload(ticker: str, payload: dict, timestamp_str: str = None):
    if "error" in payload:
        return None
        
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check if we already have this exact data for this ticker recently (prevent duplicate weekend/after-hours polling)
    cursor.execute('''
        SELECT id, spot_price, total_gex FROM gex_history 
        WHERE ticker = ? 
        ORDER BY timestamp DESC LIMIT 1
    ''', (ticker,))
    last_record = cursor.fetchone()
    
    # If the spot price and total GEX are identical to the last record, it's highly likely the market is closed or unchanged.
    if last_record:
        last_spot, last_total_gex = last_record[1], last_record[2]
        if last_spot == payload.get("spot_price") and last_total_gex == payload.get("total_gex"):
            conn.close()
            return last_record[0] # Return existing ID, skip insert
    
    # Insert new record
    if timestamp_str:
        cursor.execute('''
            INSERT INTO gex_history (ticker, timestamp, spot_price, total_gex, zero_gamma)
            VALUES (?, ?, ?, ?, ?)
        ''', (ticker, timestamp_str, payload.get('spot_price'), payload.get('total_gex'), payload.get('zero_gamma')))
    else:
        cursor.execute('''
            INSERT INTO gex_history (ticker, spot_price, total_gex, zero_gamma)
            VALUES (?, ?, ?, ?)
        ''', (ticker, payload.get('spot_price'), payload.get('total_gex'), payload.get('zero_gamma')))
        
    gex_history_id = cursor.lastrowid
    
    # We reconstruct the strike data from most_positive, most_negative, and premium_data
    # First, combine the GEX data
    gex_by_strike = {}
    for item in payload.get("most_positive", []) + payload.get("most_negative", []):
        gex_by_strike[item["strike"]] = item["gex"]
        
    # Now merge with premium data and insert
    strike_rows = []
    for item in payload.get("premium_data", []):
        strike = item["strike"]
        gex = gex_by_strike.get(strike, 0.0)
        strike_rows.append((
            gex_history_id,
            strike,
            gex,
            item["call_premium"],
            item["put_premium"]
        ))
        
    cursor.executemany('''
        INSERT INTO strike_history (gex_history_id, strike, gex, call_premium, put_premium)
        VALUES (?, ?, ?, ?, ?)
    ''', strike_rows)
    
    conn.commit()
    conn.close()
    return gex_history_id

def get_historical_gex(ticker: str, date_str: str = None):
    """
    Returns an array of GEX profiles for a specific date (defaults to today).
    Used by the frontend slider to reconstruct the chart at any timestamp.
    """
    if not date_str:
        date_str = datetime.datetime.now().strftime('%Y-%m-%d')
        
    conn = get_connection(date_str)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get all snapshots for the date
    cursor.execute('''
        SELECT id, timestamp, spot_price, total_gex, zero_gamma 
        FROM gex_history 
        WHERE ticker = ? AND date(timestamp, 'localtime') = ?
        ORDER BY timestamp ASC
    ''', (ticker, date_str))
    
    all_history_records = cursor.fetchall()
    
    # Filter to roughly 1 snapshot per minute (every 12th record if polling every 5s) to prevent massive payloads
    history_records = []
    last_dt = None
    for rec in all_history_records:
        timestamp_iso = rec["timestamp"]
        dt = datetime.datetime.strptime(timestamp_iso, "%Y-%m-%d %H:%M:%S")
        if not last_dt or (dt - last_dt).total_seconds() >= 60:
            history_records.append(rec)
            last_dt = dt
            
    results = []
    
    if not history_records:
        conn.close()
        return results

    # Get all IDs
    rec_ids = [rec["id"] for rec in history_records]
    
    # Fetch all strikes in chunks to avoid SQLite max variables limit (usually 999)
    all_strikes = []
    chunk_size = 900
    for i in range(0, len(rec_ids), chunk_size):
        chunk = rec_ids[i:i + chunk_size]
        placeholders = ",".join(["?"] * len(chunk))
        cursor.execute(f'''
            SELECT gex_history_id, strike, gex, call_premium, put_premium 
            FROM strike_history 
            WHERE gex_history_id IN ({placeholders})
        ''', chunk)
        all_strikes.extend(cursor.fetchall())
    
    # Group strikes by gex_history_id
    strikes_by_id = {}
    for s in all_strikes:
        hid = s["gex_history_id"]
        if hid not in strikes_by_id:
            strikes_by_id[hid] = []
        strikes_by_id[hid].append(s)
        
    for rec in history_records:
        rec_id = rec["id"]
        strikes = strikes_by_id.get(rec_id, [])
        
        most_positive = [{"strike": s["strike"], "gex": s["gex"]} for s in strikes if s["gex"] >= 0]
        most_negative = [{"strike": s["strike"], "gex": s["gex"]} for s in strikes if s["gex"] < 0]
        premium_data = [{"strike": s["strike"], "call_premium": s["call_premium"], "put_premium": s["put_premium"]} for s in strikes]
        
        # Sort them as expected by frontend
        most_positive.sort(key=lambda x: x["gex"])
        most_negative.sort(key=lambda x: x["gex"])
        premium_data.sort(key=lambda x: x["call_premium"] + x["put_premium"], reverse=True)
        
        # Parse UTC timestamp and convert to local time string for the UI or keep as ISO
        timestamp_iso = rec["timestamp"]
        if not timestamp_iso.endswith("Z") and "+" not in timestamp_iso:
            timestamp_iso += "Z" # SQLite CURRENT_TIMESTAMP is UTC
            
        results.append({
            "id": rec_id,
            "timestamp": timestamp_iso,
            "ticker": ticker,
            "spot_price": rec["spot_price"],
            "total_gex": rec["total_gex"],
            "zero_gamma": rec["zero_gamma"],
            "most_positive": most_positive,
            "most_negative": most_negative,
            "premium_data": premium_data
        })
        
    conn.close()
    return results

# Initialize DB for today on import
init_db()
