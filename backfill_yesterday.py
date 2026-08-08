import os
import datetime
import requests

# We want to backfill for yesterday
target_date = "2026-08-06"
timestamp_str = f"{target_date} 16:00:00" # End of day snapshot
print(f"Backfilling GEX data for {target_date}...")

# Set the DB path so db.py initializes the right file
os.environ["DB_PATH"] = f"options_history_{target_date}.db"

import db
from server import get_gex_payload

tickers = ["SPY", "QQQ", "SPX"]

for ticker in tickers:
    print(f"Fetching payload for {ticker}...")
    payload = get_gex_payload(ticker, snapshot_date=target_date)
    
    if "error" in payload:
        print(f"Failed to fetch {ticker}: {payload['error']}")
        continue
        
    db.save_gex_payload(ticker, payload, timestamp_str=timestamp_str)
    print(f"Successfully saved {ticker} to {os.environ['DB_PATH']}")

print("Backfill complete.")
