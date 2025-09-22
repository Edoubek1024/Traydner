# app/services/crypto_updater.py
import time
import threading
import httpx
from typing import Iterable, List
from app.db.mongo import crypto_prices_collection

BINANCE_US_URL = "https://api.binance.us/api/v3/ticker/price"

def _fetch_binance_price_sync(symbol: str) -> float:
    pair = f"{symbol.upper()}USD"
    with httpx.Client(timeout=10.0) as client:
        r = client.get(BINANCE_US_URL, params={"symbol": pair})
        r.raise_for_status()
        data = r.json()
        return float(data["price"])

def _update_one_symbol(symbol: str) -> None:
    price = _fetch_binance_price_sync(symbol)
    now = time.time()
    crypto_prices_collection.update_one(
        {"symbol": symbol.upper()},
        {
            "$set": {
                "symbol": symbol.upper(),
                "price": price,
                "source": "binanceus",
                "updatedAt": now,
            }
        },
        upsert=True,
    )

def run_crypto_price_loop(stop_event: threading.Event, symbols: Iterable[str], interval_seconds: int = 15) -> None:

    symbols: List[str] = [s.upper() for s in symbols]
    backoff = 1

    while not stop_event.is_set():
        try:
            for sym in symbols:
                if stop_event.is_set():
                    break
                try:
                    _update_one_symbol(sym)
                except Exception as e:
                    print(f"⚠️  Failed to update {sym}: {e}")

            backoff = 1
            stop_event.wait(interval_seconds)
            print(f"✅ Updated crypto at {time.strftime('%Y-%m-%d %H:%M:%S')}")

        except Exception as e:
            print(f"❌ Crypto updater loop error: {e}; backing off {backoff}s")
            stop_event.wait(backoff)
            backoff = min(backoff * 2, 60)

    print("🛑 Crypto updater stopped.")
