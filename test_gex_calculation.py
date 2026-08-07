import unittest
import os
import sys
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

from server import get_gex_payload, get_0dte_date

class TestGammaCalculations(unittest.TestCase):
    
    def test_spy_gamma(self):
        print("Testing SPY...")
        payload = get_gex_payload("SPY")
        self.assertNotIn("error", payload, f"SPY payload returned error: {payload.get('error')}")
        self.assertIn("total_gex", payload, "SPY payload missing total_gex")
        self.assertIsNotNone(payload["total_gex"], "SPY total_gex is None")
        self.assertNotEqual(payload["total_gex"], 0.0, "SPY total_gex is exactly 0.0 (indicates calculation failure)")
        self.assertGreater(payload["spot_price"], 0.0, "SPY spot price is invalid (0.0)")

    def test_qqq_gamma(self):
        print("Testing QQQ...")
        payload = get_gex_payload("QQQ")
        self.assertNotIn("error", payload, f"QQQ payload returned error: {payload.get('error')}")
        self.assertIn("total_gex", payload, "QQQ payload missing total_gex")
        self.assertIsNotNone(payload["total_gex"], "QQQ total_gex is None")
        self.assertNotEqual(payload["total_gex"], 0.0, "QQQ total_gex is exactly 0.0 (indicates calculation failure)")
        self.assertGreater(payload["spot_price"], 0.0, "QQQ spot price is invalid (0.0)")

    def test_spx_gamma(self):
        print("Testing SPX...")
        payload = get_gex_payload("SPX")
        self.assertNotIn("error", payload, f"SPX payload returned error: {payload.get('error')}")
        self.assertIn("total_gex", payload, "SPX payload missing total_gex")
        self.assertIsNotNone(payload["total_gex"], "SPX total_gex is None")
        self.assertNotEqual(payload["total_gex"], 0.0, "SPX total_gex is exactly 0.0 (indicates calculation failure)")
        self.assertGreater(payload["spot_price"], 0.0, "SPX spot price is invalid (0.0)")

if __name__ == '__main__':
    unittest.main()
