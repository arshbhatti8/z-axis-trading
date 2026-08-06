import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()
token = os.getenv("VITE_TRADIER_API_KEY")
res = requests.get(f"http://localhost:8001/api/history/QQQ?interval=1m&tradier_token={token}")
print(json.dumps(res.json(), indent=2)[:1000])
