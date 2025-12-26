import asyncio
import time
from datetime import datetime, timezone
import threading
from typing import Iterable, List, Tuple, Dict, Any

import httpx

from app.db.mongo import crypto_prices_collection, crypto_histories_collection
from app.services.crypto_service import get_crypto_history


BINANCE_HOSTS: List[Tuple[str, str]] = [
    ("binance.us", "USD"),
    ("binance.us", "USDT"),
    ("binance.com", "USDT"),
    ("binance.com", "BUSD"),
]

def _fetch_binance_price_sync(symbol: str, client: httpx.Client) -> Tuple[float, str]:
    sym = symbol.upper()
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

def _update_one_symbol_price(symbol: str, client: httpx.Client) -> None:
    price, source = _fetch_binance_price_sync(symbol, client)
    now = time.time()

    existing = crypto_prices_collection.find_one({"symbol": symbol.upper()}, {"price": 1})
    if existing and "price" in existing and float(existing["price"]) == price:
        crypto_prices_collection.update_one(
            {"symbol": symbol.upper()},
            {"$set": {"updatedAt": now, "source": source}},
            upsert=True,
        )
        return

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
    interval_seconds: int = 15,
) -> None:
    symbols_up: List[str] = [s.upper() for s in symbols]
    transport = httpx.HTTPTransport(retries=2)
    backoff = 1

    with httpx.Client(timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
                      transport=transport) as client:
        while not stop_event.is_set():
            try:
                for sym in symbols_up:
                    if stop_event.is_set():
                        break
                    try:
                        _update_one_symbol_price(sym, client)
                    except Exception as e:
                        print(f"⚠️  Failed to update {sym}: {e}")

                backoff = 1
                now = time.time()
                sleep_for = max(0.2, interval_seconds - (now % interval_seconds))
                stop_event.wait(sleep_for)
                print(f"✅ Updated crypto at {time.strftime('%Y-%m-%d %H:%M:%S')}")
            except Exception as e:
                print(f"❌ Crypto updater loop error: {e}; backing off {backoff}s")
                stop_event.wait(backoff)
                backoff = min(backoff * 2, 60)

    print("🛑 Crypto updater stopped.")


INCREMENTS: Dict[str, int | None] = {
    "1": 60,
    "5": 300,
    "15": 900,
    "30": 1800,
    "60": 3600,
    "120": 7200,
    "240": 14400,
    "D": 86400,
    "W": 604800,
    "M": None,
}

HISTORY_LIMITS: Dict[str, int] = {
    "1": 480,
    "5": 288,
    "15": 288,
    "30": 336,
    "60": 360,
    "120": 360,
    "240": 540,
    "D": 366,
    "W": 261,
    "M": 60,
}

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
    return dt.weekday() == 0 and dt.hour == 0 and dt.minute == 0

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
    limit = HISTORY_LIMITS.get(key)
    if not limit or len(candles) <= limit:
        return candles
    return candles[-limit:]

async def ensure_crypto_histories(symbols: List[str]):
    for sym in symbols:
        symbol = sym.upper()
        existing = await asyncio.to_thread(
            crypto_histories_collection.find_one, {"symbol": symbol}
        )
        if existing:
            continue

        histories: Dict[str, List[Dict[str, Any]]] = {k: [] for k in INCREMENTS.keys()}

        for key, res in RESOLUTION_MAP.items():
            try:
                h = await get_crypto_history(symbol, res, limit=max(HISTORY_LIMITS.get(key, 500), 500))
                if "history" in h and h["history"]:
                    histories[key] = _cap(h["history"], key)
                    print(f"✅ {symbol}: init {len(histories[key])} candles [{key}]")
            except Exception as e:
                print(f"⚠️ {symbol}: init error {key}: {e}")

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


async def _update_one_symbol_history(symbol: str, now_ts: int):
    symbol = symbol.upper()

    price_doc = await asyncio.to_thread(
        crypto_prices_collection.find_one, {"symbol": symbol}
    )
    if not price_doc or "price" not in price_doc:
        return
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
        return

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
            histories[key] = _cap(candles, key)
            changed = True
        else:
            last["close"] = current_price
            last["high"] = max(last["high"], current_price)
            last["low"]  = min(last["low"],  current_price)
            histories[key] = _cap(candles, key)
            changed = True

    if changed:
        await asyncio.to_thread(
            crypto_histories_collection.update_one,
            {"symbol": symbol},
            {"$set": {"histories": histories, "updatedAt": now_ts}},
        )

async def update_crypto_histories(symbols: List[str], max_concurrency: int = 8):
    now_ts = _start_of_minute_ts()
    sem = asyncio.Semaphore(max_concurrency)

    async def worker(sym: str):
        async with sem:
            try:
                await _update_one_symbol_history(sym, now_ts)
            except Exception as e:
                print(f"⚠️ crypto history update failed for {sym}: {e}")

    await asyncio.gather(*(worker(s) for s in symbols))

async def run_crypto_history_loop(symbols: List[str], max_concurrency: int = 8):
    await asyncio.sleep(10)
    await ensure_crypto_histories(symbols)

    next_tick = _start_of_minute_ts() + 60

    while True:
        try:
            await update_crypto_histories(symbols, max_concurrency=max_concurrency)
            print("📈 Crypto histories updated")
        except Exception as e:
            print(f"❌ Crypto history loop error: {e}")

        now = time.time()
        if now >= next_tick:
            missed = int((now - next_tick) // 60) + 1
            next_tick += 60 * missed
        sleep_for = max(0.0, next_tick - now)
        await asyncio.sleep(sleep_for)
        next_tick += 60
