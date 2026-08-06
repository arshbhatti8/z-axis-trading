import os
import requests
import datetime
from dotenv import load_dotenv

load_dotenv()
massive_key = os.getenv("MASSIVE_API_KEY")

tomorrow_str = "2026-08-07"

for ticker in ["SPX", "SPY", "QQQ", "TSLA", "AAPL", "MU", "NBIS"]:
    url = f"https://api.massive.com/v3/snapshot/options/{ticker}"
    params = {"expiration_date": tomorrow_str, "apiKey": massive_key}
    res = requests.get(url, params=params)
    if res.status_code == 200:
        data = res.json()
        results = data.get("results", [])
        if results:
            print(f"{ticker}: Success! Options: {len(results)}")
        else:
            print(f"{ticker}: No options data found for {tomorrow_str}")
    else:
        print(f"{ticker}: Failed with {res.status_code}")
