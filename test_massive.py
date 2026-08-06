import os
import requests
import datetime
from dotenv import load_dotenv

load_dotenv()
massive_key = os.getenv("MASSIVE_API_KEY")

today = datetime.datetime.today()
if today.weekday() >= 5: # 5=Sat, 6=Sun
    today += datetime.timedelta(days=(7 - today.weekday()))
today_str = today.strftime('%Y-%m-%d')

for ticker in ["SPX", "SPY", "QQQ", "TSLA", "AAPL", "MU", "NBIS"]:
    url = f"https://api.massive.com/v3/snapshot/options/{ticker}"
    params = {"expiration_date": today_str, "apiKey": massive_key}
    res = requests.get(url, params=params)
    if res.status_code == 200:
        data = res.json()
        results = data.get("results", [])
        if results:
            print(f"{ticker}: Success! Spot: {results[0].get('underlying_asset', {}).get('price')} Options: {len(results)}")
        else:
            print(f"{ticker}: No options data found for {today_str}")
    else:
        print(f"{ticker}: Failed with {res.status_code}")
