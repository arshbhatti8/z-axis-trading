import asyncio
import websockets
import json
import requests
import datetime

async def test_ws():
    res = requests.post('https://api.tradier.com/v1/markets/events/session', headers={'Authorization': 'Bearer AClhXZSAZ4c8RTiOfgqe6EZwjzAy', 'Accept': 'application/json'})
    session_id = res.json()['stream']['sessionid']
    
    async with websockets.connect('wss://ws.tradier.com/v1/markets/events') as ws:
        payload = {
            "events": {
                "command": "subscribe",
                "sessionid": session_id,
                "symbols": ["SPY"],
                "lineFilter": False
            }
        }
        await ws.send(json.dumps(payload))
        
        for _ in range(5):
            msg = await ws.recv()
            print(datetime.datetime.now(), msg)

asyncio.run(test_ws())
