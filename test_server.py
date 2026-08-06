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

def test_calculate_gex_premium():
    from server import calculate_gex
    mock_data = {
        "results": [
            {
                "underlying_asset": {"price": 100.0},
                "details": {"contract_type": "call", "strike_price": 100.0, "last_price": 2.5},
                "greeks": {"gamma": 0.05},
                "open_interest": 100
            },
            {
                "underlying_asset": {"price": 100.0},
                "details": {"contract_type": "put", "strike_price": 100.0, "last_price": 3.0},
                "greeks": {"gamma": 0.06},
                "open_interest": 200,
                "day": {"close": 3.5}
            }
        ]
    }
    
    total_gex, strike_gex, spot_price, strike_premium = calculate_gex(mock_data)
    
    assert spot_price == 100.0
    assert 100.0 in strike_premium
    # call premium: 2.5 * 100 * 100 = 25000.0
    assert strike_premium[100.0]["call_premium"] == 25000.0
    # put premium: 3.5 * 200 * 100 = 70000.0
    assert strike_premium[100.0]["put_premium"] == 70000.0

@pytest.mark.asyncio
async def test_websocket_anomalous():
    client = TestClient(app)
    with client.websocket_connect("/ws/anomalous/AAPL") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "anomalous_trade"
        assert data["ticker"] == "AAPL"
        assert "size" in data
        assert "price" in data
