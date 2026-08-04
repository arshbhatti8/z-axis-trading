import pytest
import httpx
from fastapi.testclient import TestClient
import asyncio
from server import app
import websockets

def test_history_endpoint_yahoo():
    with TestClient(app) as client:
        response = client.get("/api/history/AAPL?interval=1D")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "source" in data
        assert data["source"] == "yahoo"

@pytest.mark.asyncio
async def test_websocket_cleanup():
    # Test that when the websocket disconnects, the background task is cancelled
    client = TestClient(app)
    with client.websocket_connect("/ws/gex/AAPL") as websocket:
        data = websocket.receive_json()
        assert "ticker" in data or "error" in data
    # When leaving the context, the websocket disconnects.
    # We just want to ensure it doesn't leave lingering tasks or exceptions.
    # FastAPI TestClient doesn't directly expose active tasks, but we can verify it doesn't crash.
    await asyncio.sleep(0.1)
