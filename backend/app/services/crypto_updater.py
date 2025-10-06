# app/services/crypto_updater.py
import asyncio
import time
from datetime import datetime, timezone
import threading
from typing import Iterable, List, Tuple, Dict, Any

import httpx

from app.db.mongo import crypto_prices_collection, crypto_histories_collection
from app.core.symbols import CRYPTO_SYMBOLS
from app.services.crypto_service import get_crypto_history

# ----------------------------- Price Updater ------------------------------

BINANCE_HOSTS: List[Tuple[str, str]] = [
    ("binance.us", "USD"),
    ("binance.us", "USDT"),
    ("binance.com", "USDT"),
    ("binance.com", "BUSD"),
]

def _fetch_binance_price_sync(symbol: str) -> Tuple[float, str]:
    sym = symbol.upper()
    with httpx.Client(timeout=10.0) as client:
        for host, quote in BINANCE_HOSTS:
            pair = f"{sym}{quote}"
            url = f"https://api.{host}/api/v3/ticker/price"
            try:
                r = client.get(url, params={"symbol": pair})
                r.raise_for_status()
                data = r.json()
                price = float(data["price"])
                return price, f"{host}:{pair}"
            except Exception:
                continue
    raise RuntimeError(f"No price found for {sym} across hosts/pairs")

def _update_one_symbol(symbol: str) -> None:
    price, source = _fetch_binance_price_sync(symbol)
    now = time.time()
    crypto_prices_collection.update_one(
        {"symbol": symbol.upper()},
        {"$set": {
            "symbol": symbol.upper(),
            "price": price,
            "source": source,
            "updatedAt": now,
        }},
        upsert=True,
    )

def run_crypto_price_loop(
    stop_event: threading.Event,
    symbols: Iterable[str],
    interval_seconds: int = 15
) -> None:
    symbols_up: List[str] = [s.upper() for s in symbols]
    backoff = 1
    while not stop_event.is_set():
        try:
            for sym in symbols_up:
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

# ---------------------------- History Updater -----------------------------

INCREMENTS: Dict[str, int | None] = {
    "1": 60,        # 1m
    "5": 300,       # 5m
    "15": 900,      # 15m
    "30": 1800,     # 30m
    "60": 3600,     # 1h
    "120": 7200,    # 2h
    "240": 14400,   # 4h
    "D": 86400,     # 1d  (UTC midnight)
    "W": 604800,    # 1w  (UTC Monday 00:00)
    "M": None,      # 1M  (month boundary; handled separately)
}

# HARD SIZE LIMITS (trim oldest beyond these)
HISTORY_LIMITS: Dict[str, int] = {
    "1": 480,      # 1m:   480
    "5": 288,      # 5m:   288
    "15": 288,     # 15m:  288
    "30": 336,     # 30m:  336
    "60": 360,     # 60m:  168
    "120": 360,    # 2h:   168
    "240": 540,    # 4h:   168
    "D": 366,      # 1d:   366
    "W": 261,      # 1w:   261
    "M": 60,       # 1M:   60
}

# For init via crypto_service (Binance klines)
RESOLUTION_MAP: Dict[str, str] = {
    "1": "1", "5": "5", "15": "15", "30": "30",
    "60": "60", "120": "120", "240": "240",
    "D": "D", "W": "W", "M": "M"
}

UTC = timezone.utc

def _start_of_minute_ts(now: float | None = None) -> int:
    if now is None:
        now = time.time()
    return int(now // 60 * 60)

def _is_day_boundary_utc(ts: int) -> bool:
    dt = datetime.fromtimestamp(ts, UTC)
    return dt.hour == 0 and dt.minute == 0

def _is_week_boundary_utc(ts: int) -> bool:
    dt = datetime.fromtimestamp(ts, UTC)
    return dt.weekday() == 0 and dt.hour == 0 and dt.minute == 0  # Monday 00:00 UTC

def _is_month_boundary_utc(ts: int) -> bool:
    dt = datetime.fromtimestamp(ts, UTC)
    return dt.day == 1 and dt.hour == 0 and dt.minute == 0

def _is_boundary(ts: int, key: str, seconds_per: int | None) -> bool:
    if key in {"1","5","15","30","60","120","240"}:
        return ts % int(seconds_per) == 0
    if key == "D":
        return _is_day_boundary_utc(ts)
    if key == "W":
        return _is_week_boundary_utc(ts)
    if key == "M":
        return _is_month_boundary_utc(ts)
    return False

def _seed(price: float, ts: int) -> Dict[str, Any]:
    return {
        "timestamp": ts,
        "open": price,
        "high": price,
        "low":  price,
        "close": price,
        "volume": 0.0,
    }

def _cap(candles: List[Dict[str, Any]], key: str) -> List[Dict[str, Any]]:
    """Keep only the most-recent N candles for this key."""
    limit = HISTORY_LIMITS.get(key)
    if not limit or len(candles) <= limit:
        return candles
    return candles[-limit:]

async def ensure_crypto_histories(symbols: List[str]):
    """
    Initialize histories if missing:
      - Try Binance klines via get_crypto_history() per bucket
      - If everything empty, seed all buckets from current Mongo price
      - Always cap to HISTORY_LIMITS
    """
    for sym in symbols:
        symbol = sym.upper()
        existing = await asyncio.to_thread(
            crypto_histories_collection.find_one, {"symbol": symbol}
        )
        if existing:
            continue

        histories: Dict[str, List[Dict[str, Any]]] = {k: [] for k in INCREMENTS.keys()}

        # Best-effort backfill per bucket
        for key, res in RESOLUTION_MAP.items():
            try:
                h = await get_crypto_history(symbol, res, limit=max(HISTORY_LIMITS.get(key, 500), 500))
                if "history" in h and h["history"]:
                    histories[key] = _cap(h["history"], key)
                    print(f"✅ {symbol}: init {len(histories[key])} candles [{key}]")
            except Exception as e:
                print(f"⚠️ {symbol}: init error {key}: {e}")

        # If totally empty, seed from current Mongo price
        if all(len(v) == 0 for v in histories.values()):
            price_doc = await asyncio.to_thread(
                crypto_prices_collection.find_one, {"symbol": symbol}
            )
            if not price_doc or "price" not in price_doc:
                print(f"🔴 {symbol}: no Mongo price to seed; will initialize later")
                continue
            cur = float(price_doc["price"])
            ts0 = _start_of_minute_ts()
            for k in histories.keys():
                histories[k] = _cap([_seed(cur, ts0)], k)
            print(f"🟡 {symbol}: seeded all buckets from Mongo price {cur}")

        await asyncio.to_thread(
            crypto_histories_collection.update_one,
            {"symbol": symbol},
            {"$set": {"symbol": symbol, "histories": histories, "updatedAt": int(time.time())}},
            upsert=True,
        )
        print(f"✅ Initialized crypto histories for {symbol}")

async def update_crypto_histories(symbols: List[str]):
    """
    Every minute:
      - Read ONLY Mongo price (crypto_prices_collection)
      - Update last candle OR append a new candle at boundary
      - Enforce HISTORY_LIMITS on every write
    """
    now_ts = _start_of_minute_ts()

    for sym in symbols:
        symbol = sym.upper()

        price_doc = await asyncio.to_thread(
            crypto_prices_collection.find_one, {"symbol": symbol}
        )
        if not price_doc or "price" not in price_doc:
            continue
        current_price = float(price_doc["price"])

        doc = await asyncio.to_thread(
            crypto_histories_collection.find_one, {"symbol": symbol}
        )
        if not doc:
            seed = _seed(current_price, now_ts)
            histories = {k: _cap([seed], k) for k in INCREMENTS.keys()}
            await asyncio.to_thread(
                crypto_histories_collection.update_one,
                {"symbol": symbol},
                {"$set": {"symbol": symbol, "histories": histories, "updatedAt": now_ts}},
                upsert=True,
            )
            print(f"🟡 {symbol}: created fresh crypto histories with seed")
            continue

        histories: Dict[str, List[Dict[str, Any]]] = doc.get("histories", {}) or {}
        changed = False

        for key, seconds_per in INCREMENTS.items():
            candles = histories.get(key, [])

            if not candles:
                candles = _cap([_seed(current_price, now_ts)], key)
                histories[key] = candles
                changed = True
                continue

            last = candles[-1]
            on_boundary = _is_boundary(now_ts, key, seconds_per)

            if on_boundary and last["timestamp"] != now_ts:
                last_close = last["close"]
                candles.append({
                    "timestamp": now_ts,
                    "open": last_close,
                    "high": max(last_close, current_price),
                    "low":  min(last_close, current_price),
                    "close": current_price,
                    "volume": float(last.get("volume", 0.0)),
                })
                candles = _cap(candles, key)
                histories[key] = candles
                changed = True
            else:
                last["close"] = current_price
                last["high"] = max(last["high"], current_price)
                last["low"]  = min(last["low"],  current_price)
                # Even on mutation, enforce cap (harmless if already within limit)
                histories[key] = _cap(candles, key)
                changed = True

        if changed:
            await asyncio.to_thread(
                crypto_histories_collection.update_one,
                {"symbol": symbol},
                {"$set": {"histories": histories, "updatedAt": now_ts}},
            )

async def run_crypto_history_loop(symbols: List[str]):
    await asyncio.sleep(10)  # let price loop warm up
    await ensure_crypto_histories(symbols)

    while True:
        try:
            await update_crypto_histories(symbols)
            print(f"📈 Crypto histories updated")
        except Exception as e:
            print(f"❌ Crypto history loop error: {e}")
        await asyncio.sleep(60 - time.time() % 60)
