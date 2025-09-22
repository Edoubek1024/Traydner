# app/services/forex_updater.py
import time
import threading
import traceback
from typing import Callable, Dict, Optional

from app.db.mongo import forex_prices_collection

# Adjust this import if your scraper function lives elsewhere
try:
    from app.services.forex_service import get_usd_based_forex  # your Selenium-based fetcher
except Exception as e:
    get_usd_based_forex = None  # type: ignore
    _import_error = e


def update_forex_prices_once(
    fetcher: Optional[Callable[[], Dict[str, float]]] = None,
    source: str = "fxstreet",
) -> Dict[str, int]:
    """
    Calls `get_usd_based_forex()` (or a provided fetcher), then upserts into Mongo.
    Returns {"count": N} for visibility.
    """
    if fetcher is None:
        if get_usd_based_forex is None:
            raise ImportError(f"Could not import get_usd_based_forex: {_import_error}")
        fetcher = get_usd_based_forex

    try:
        prices = fetcher()  # {"EUR/USD": 1.09, "JPY/USD": 0.0063, ...}
    except Exception as e:
        print(f"❌ Forex fetch failed: {e}")
        traceback.print_exc()
        return {"count": 0}

    now = time.time()
    count = 0
    for symbol, price in prices.items():
        try:
            forex_prices_collection.update_one(
                {"symbol": symbol},
                {
                    "$set": {
                        "symbol": symbol,
                        "price": float(price),
                        "source": source,
                        "updatedAt": now,
                    }
                },
                upsert=True,
            )
            count += 1
        except Exception as e:
            print(f"⚠️  Failed to upsert {symbol}: {e}")
            traceback.print_exc()

    if count == 0:
        print("⚠️  No forex prices wrote to Mongo (empty fetcher result).")

    return {"count": count}


def run_forex_price_loop(
    stop_event: threading.Event,
    interval_seconds: int = 60,
    fetcher: Optional[Callable[[], Dict[str, float]]] = None,
    source: str = "fxstreet",
) -> None:
    """
    Background loop that refreshes forex prices periodically using `get_usd_based_forex()`.
    Does exponential backoff on errors.
    """
    backoff = 1
    while not stop_event.is_set():
        try:
            summary = update_forex_prices_once(fetcher=fetcher, source=source)
            if summary["count"] > 0:
                print(
                    f"✅ Forex updated {summary['count']} pairs at "
                    f"{time.strftime('%Y-%m-%d %H:%M:%S')}"
                )
            backoff = 1
            stop_event.wait(interval_seconds)
        except Exception as e:
            print(f"❌ Forex updater loop error: {e}; backing off {backoff}s")
            traceback.print_exc()
            stop_event.wait(backoff)
            backoff = min(backoff * 2, 60)
    print("🛑 Forex updater stopped.")


if __name__ == "__main__":
    # Optional: run one shot for quick testing
    print(update_forex_prices_once())
