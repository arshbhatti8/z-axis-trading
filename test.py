import os
import requests
from dotenv import load_dotenv

load_dotenv()
massive_key = os.getenv("MASSIVE_API_KEY")

for ticker in ["NBIS", "TSLA", "MU", "AAPL"]:
    url = f"https://api.massive.com/v3/options/gex/0dte?ticker={ticker}"
    res = requests.get(url, headers={"Authorization": f"Bearer {massive_key}"})
    if res.status_code == 200:
        data = res.json()
        print(f"{ticker}: Success! Spot: {data.get('spot_price')} Strikes: {len(data.get('most_positive', [])) + len(data.get('most_negative', []))}")
    else:
        print(f"{ticker}: Failed with {res.status_code}")
