import asyncio
import time
import threading
import traceback
from typing import Callable, Dict, Optional, List
from datetime import datetime, timedelta, timezone as dt_tz
from pytz import timezone as pytz_timezone


from app.db.mongo import forex_prices_collection, forex_histories_collection

# Adjust this import if your scraper function lives elsewhere
try:
    from app.services.forex_service import get_usd_based_forex, get_forex_market_status, get_forex_history
except Exception as e:
    get_usd_based_forex = None  # type: ignore
    get_forex_market_status = None  # type: ignore
    get_forex_history = None  # type: ignore
    _import_error = e


def update_forex_prices_once(
    fetcher: Optional[Callable[[], Dict[str, float]]] = None,
    source: str = "yahoo_html",
) -> Dict[str, int]:

    if fetcher is None:
        if get_usd_based_forex is None:
            raise ImportError(f"Could not import get_usd_based_forex: {_import_error}")
        fetcher = get_usd_based_forex
    if not callable(fetcher):
        raise TypeError(f"'fetcher' must be callable, got {type(fetcher).__name__}")

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
            base = symbol.split("/")[0] if "/" in symbol else symbol
            forex_prices_collection.update_one(
                {"symbol": base},
                {"$set": {
                    "symbol": base,
                    "price": float(price),
                    "source": source,
                    "updatedAt": now,
                }},
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
    source: str = "yahoo_html",
) -> None:

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

INCREMENTS: Dict[str, Optional[int]] = {
    "1": 60,
    "5": 300,
    "15": 900,
    "30": 1800,      # NEW
    "60": 3600,
    "120": 7200,     # NEW
    "240": 14400,    # NEW
    "D": 86400,
    "W": 7 * 86400,
    "M": None,
}

HISTORY_LIMITS = {
    "1": 480,   # 1 day @ 1-min (Fx is 24h)
    "5": 288,   # ~1 week of 5-min
    "30": 336,  # ~28 days of 15-min
    "120": 360,   # ~30 days of hourly
    "240": 370,
    "D": 365,    # ~1 year of daily
    "W": 520,    # ~10 years of weekly
    "M": 120,    # 10 years of monthly
}

# Map our keys to yfinance-friendly resolutions for initial seeding.
# Note: Yahoo FX lacks monthly directly; we'll aggregate D → M while seeding.
RESOLUTION_MAP = {
    "1":   "1m",
    "5":   "5m",
    "15":  "15m",
    "30":  "30m",   # native
    "60":  "60m",   # native
    "120": "60m",   # fetch 60m then aggregate to 120m (2h)
    "240": "60m",   # fetch 60m then aggregate to 240m (4h)
    "D":   "1d",
    "W":   "1wk",
    "M":   "1d",    # fetch daily and aggregate to months during seeding
}

EASTERN = pytz_timezone("US/Eastern")


def _start_of_minute_ts(now: float | None = None) -> int:
    if now is None:
        now = time.time()
    return int(now // 60 * 60)


def _eastern_midnight(ts: int) -> int:
    dt = datetime.fromtimestamp(ts, EASTERN)
    dt0 = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(dt0.timestamp())


def _eastern_week_start(ts: int) -> int:
    dt = datetime.fromtimestamp(ts, EASTERN)
    dt0 = dt - timedelta(days=dt.weekday())  # Monday=0
    dt0 = dt0.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(dt0.timestamp())


def _eastern_month_start(ts: int) -> int:
    dt = datetime.fromtimestamp(ts, EASTERN)
    dt0 = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return int(dt0.timestamp())


def _candle_start(ts: int, key: str, seconds_per: Optional[int]) -> int:
    if key in {"1","5","15","30","60","120","240"} and seconds_per:  # ← add these
        return ts - (ts % seconds_per)
    if key == "D":
        return _eastern_midnight(ts)
    if key == "W":
        return _eastern_week_start(ts)
    if key == "M":
        return _eastern_month_start(ts)
    return _start_of_minute_ts(ts)


def _seed(price: float, ts: int) -> dict:
    return {
        "timestamp": ts,
        "open": price,
        "high": price,
        "low": price,
        "close": price,
        "volume": 0,
    }


def _cap(lst: List[dict], key: str) -> List[dict]:
    lim = HISTORY_LIMITS.get(key)
    if not lim or len(lst) <= lim:
        return lst
    return lst[-lim:]


def _aggregate_rows_to_buckets(rows: List[dict], key: str) -> List[dict]:

    if not rows:
        return []

    seconds_per = INCREMENTS.get(key)
    buckets: Dict[int, dict] = {}

    for r in rows:
        ts = int(r["timestamp"])
        cs = _candle_start(ts, key, seconds_per)
        o, h, l, c, v = (
            float(r.get("open", r.get("close", 0.0))),
            float(r.get("high", r.get("close", 0.0))),
            float(r.get("low", r.get("close", 0.0))),
            float(r.get("close", 0.0)),
            int(r.get("volume", 0) or 0),
        )
        b = buckets.get(cs)
        if b is None:
            buckets[cs] = {"timestamp": cs, "open": o, "high": h, "low": l, "close": c, "volume": v}
        else:
            b["high"] = max(b["high"], h)
            b["low"] = min(b["low"], l)
            b["close"] = c
            b["volume"] = (b.get("volume", 0) or 0) + v

    return sorted(buckets.values(), key=lambda x: x["timestamp"])  # ASC


async def ensure_forex_histories(bases: List[str]):
    if get_forex_history is None:
        raise ImportError("get_forex_history unavailable")

    for base in bases:
        try:
            symbol = base.upper()
            existing = await asyncio.to_thread(forex_histories_collection.find_one, {"symbol": symbol})
            if existing:
                continue

            histories: Dict[str, List[dict]] = {k: [] for k in INCREMENTS.keys()}

            # Seed D/W/M in order (works 24/5). M aggregates from daily.
            for key in ("D", "W"):
                yf_res = RESOLUTION_MAP[key]
                try:
                    h = await get_forex_history(symbol, yf_res)
                    if "history" in h and h["history"]:
                        histories[key] = _cap(h["history"], key)
                        print(f"✅ {symbol}: init {len(histories[key])} [{key}]")
                except Exception as e:
                    print(f"⚠️ {symbol}: init {key} error: {e}")

            # Monthly via aggregation of daily
            if not histories["D"]:
                # fetch daily if missing (for monthly aggregation)
                try:
                    h = await get_forex_history(symbol, "1d")
                    if "history" in h and h["history"]:
                        histories["D"] = _cap(h["history"], "D")
                except Exception as e:
                    print(f"⚠️ {symbol}: fallback daily fetch for M failed: {e}")

            if histories["D"]:
                monthly = _aggregate_rows_to_buckets(histories["D"], "M")
                histories["M"] = _cap(monthly, "M")
                print(f"✅ {symbol}: init {len(histories['M'])} [M]")

            # Intraday: 60, 30, 15, 5, 1 (best-effort)
            for key in ("60", "30", "15", "5", "1"):
                yf_res = RESOLUTION_MAP[key]
                try:
                    h = await get_forex_history(symbol, yf_res)
                    if "history" in h and h["history"]:
                        histories[key] = _cap(h["history"], key)
                        print(f"✅ {symbol}: init {len(histories[key])} [{key}]")
                except Exception as e:
                    print(f"⚠️ {symbol}: init {key} error: {e}")

            if histories.get("60"):
                histories["120"] = _cap(_aggregate_rows_to_buckets(histories["60"], "120"), "120")
                histories["240"] = _cap(_aggregate_rows_to_buckets(histories["60"], "240"), "240")
                print(f"✅ {symbol}: init {len(histories['120'])} [120]")
                print(f"✅ {symbol}: init {len(histories['240'])} [240]")

            # If 30m missing, derive from 5m as fallback
            if not histories.get("30") and histories.get("5"):
                histories["30"] = _cap(_aggregate_rows_to_buckets(histories["5"], "30"), "30")
                print(f"✅ {symbol}: init {len(histories['30'])} [30] (from 5m)")

            # If nothing came back, seed from Mongo price
            if all(len(v) == 0 for v in histories.values()):
                price_doc = await asyncio.to_thread(forex_prices_collection.find_one, {"symbol": symbol})
                if price_doc and "price" in price_doc:
                    cur = float(price_doc["price"])
                    now_ts = _start_of_minute_ts()
                    for k, seconds_per in INCREMENTS.items():
                        cs = _candle_start(now_ts, k, seconds_per)
                        histories[k] = _cap([_seed(cur, cs)], k)
                    print(f"🟡 {symbol}: seeded histories from Mongo price {cur}")
                else:
                    print(f"🔴 {symbol}: no price in Mongo to seed; skipping init")
                    continue

            await asyncio.to_thread(
                forex_histories_collection.update_one,
                {"symbol": symbol},
                {"$set": {"symbol": symbol, "histories": histories, "updatedAt": int(time.time())}},
                upsert=True,
            )
            print(f"✅ Initialized forex histories for {symbol}")

        except Exception as e:
            print(f"❌ Error initializing {base}: {e}")


async def _is_fx_open_now() -> bool:
    try:
        if get_forex_market_status is None:
            return True  # be permissive if status checker not available
        status = await get_forex_market_status()
        return bool(status.get("isOpen", False))
    except Exception as e:
        print(f"⚠️ get_forex_market_status failed: {e}; assuming closed this tick")
        return False


async def update_forex_histories(bases: List[str]):
    # Only add/roll candles when FX market is open (24/5 semantics)
    if not await _is_fx_open_now():
        print("⏸️ FX market closed — skipping forex history update this minute")
        return

    now_ts = _start_of_minute_ts()

    for base in bases:
        try:
            symbol = base.upper()
            price_doc = await asyncio.to_thread(forex_prices_collection.find_one, {"symbol": symbol})
            if not price_doc or "price" not in price_doc:
                continue
            current_price = float(price_doc["price"])

            doc = await asyncio.to_thread(forex_histories_collection.find_one, {"symbol": symbol})
            if not doc:
                # Align seeds across all keys
                histories = {}
                for k, seconds_per in INCREMENTS.items():
                    cs = _candle_start(now_ts, k, seconds_per)
                    histories[k] = _cap([_seed(current_price, cs)], k)
                await asyncio.to_thread(
                    forex_histories_collection.update_one,
                    {"symbol": symbol},
                    {"$set": {"symbol": symbol, "histories": histories, "updatedAt": now_ts}},
                    upsert=True,
                )
                print(f"🟡 {symbol}: created fresh FX histories with aligned seed")
                continue

            histories: dict = doc.get("histories", {}) or {}
            changed = False

            for key, seconds_per in INCREMENTS.items():
                candles: List[dict] = histories.get(key, [])
                cs = _candle_start(now_ts, key, seconds_per)

                if not candles:
                    histories[key] = _cap([_seed(current_price, cs)], key)
                    changed = True
                    continue

                last = candles[-1]
                last_ts = int(last["timestamp"])

                if cs > last_ts:
                    # roll to a new candle starting at aligned boundary
                    last_close = last["close"]
                    candles.append({
                        "timestamp": cs,
                        "open": last_close,
                        "high": max(last_close, current_price),
                        "low": min(last_close, current_price),
                        "close": current_price,
                        "volume": 0,
                    })
                    histories[key] = _cap(candles, key)
                    changed = True
                else:
                    # update current candle
                    last["close"] = current_price
                    last["high"] = max(last["high"], current_price)
                    last["low"] = min(last["low"], current_price)
                    histories[key] = _cap(candles, key)
                    changed = True

            if changed:
                await asyncio.to_thread(
                    forex_histories_collection.update_one,
                    {"symbol": symbol},
                    {"$set": {"histories": histories, "updatedAt": now_ts}},
                )

        except Exception as e:
            print(f"⚠️ Error updating {base}: {e}")


async def run_forex_history_loop(bases: List[str]):
    await ensure_forex_histories(bases)
    while True:
        try:
            await update_forex_histories(bases)
            print("📈 Forex histories updated")
        except Exception as e:
            print(f"❌ Forex history loop error: {e}")
        await asyncio.sleep(60 - time.time() % 60)
