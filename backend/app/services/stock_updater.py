import asyncio
import time
import httpx
from datetime import datetime, timezone as dt_tz, timedelta
from pytz import timezone as pytz_timezone


from app.db.mongo import stock_prices_collection, stock_histories_collection
from app.core.symbols import STOCK_SYMBOLS
from app.core.config import FINNHUB_API_KEYS
from app.services.stock_service import get_stock_history, is_market_open

def get_api_key(i):
  return FINNHUB_API_KEYS[i % len(FINNHUB_API_KEYS)]

async def fetch_prices():
  async with httpx.AsyncClient() as client:
    results = []
    for i, symbol in enumerate(STOCK_SYMBOLS):
      api_key = get_api_key(i)
      url = f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={api_key}"
      result = await fetch_finnhub_price(symbol, client, url)
      results.append(result)
      await asyncio.sleep(0.35)
    return results

async def fetch_finnhub_price(symbol: str, client: httpx.AsyncClient, url: str) -> dict:
  res = None

  try:
    res = await client.get(url)
    res.raise_for_status()
    data = res.json()
    if "c" not in data or data["c"] == 0:
      return {"symbol": symbol.upper(), "error": "Invalid or zero price received", "data": data}
    return {"symbol": symbol.upper(), "price": data["c"]}
  except Exception as e:
    return {
      "symbol": symbol.upper(),
      "error": str(e),
      "status_code": res.status_code if res else None,
      "body": res.text if res else None,
    }


def update_prices_to_mongo():
  loop = asyncio.new_event_loop()
  asyncio.set_event_loop(loop)
  results = loop.run_until_complete(fetch_prices())
  loop.close()

  for result in results:
    if "price" in result:
      stock_prices_collection.update_one(
        {"symbol": result["symbol"]},
        {
          "$set": {
            "price": result["price"],
            "source": "finnhub",
            "updatedAt": time.time()
          }
        },
        upsert=True
      )
    else:
      print(f"❌ Failed to fetch price for {result.get('symbol')}: {result.get('error')}")


def run_stock_price_loop(stop_event):
  while not stop_event.is_set():
    update_prices_to_mongo()
    print(f"✅ Updated stock prices at {time.strftime('%Y-%m-%d %H:%M:%S')}")

INCREMENTS = {
    "1": 60,       # 1 minute
    "5": 300,      # 5 minutes
    "15": 900,     # 15 minutes
    "30": 1800,    # 30 minutes
    "60": 3600,    # 60 minutes
    "D": 86400,    # 1 day (anchor to US/Eastern midnight)
    "W": 7 * 86400, # weekly bucket (anchor to US/Eastern Monday 00:00)
    "M": None,      # month bucket (anchor to US/Eastern 1st 00:00)
}

# HARD SIZE LIMITS (drop oldest beyond these)
HISTORY_LIMITS = {
    "1": 390,    # 1d window of 1-min or your desired size
    "5": 390,
    "15": 390,
    "30": 286,
    "60": 429,
    "D": 251,
    "W": 261,
    "M": 60,
}

# For initialization (yfinance)
RESOLUTION_MAP = {
    "1": "1m",
    "5": "5m",
    "15": "15m",
    "30": "30m",
    "60": "60m",
    "D": "1d",
    "W": "1wk",   # NEW: ask yfinance for weekly
    "M": "1mo",   # NEW: ask yfinance for monthly
}

EASTERN = pytz_timezone("US/Eastern")

def _start_of_minute_ts(now: float | None = None) -> int:
    if now is None: now = time.time()
    return int(now // 60 * 60)

# ---- NEW: canonical candle starts (US/Eastern for D/W/M) ----
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

def _candle_start(ts: int, key: str, seconds_per: int | None) -> int:
    if key in {"1","5","15","30","60"} and seconds_per:
        return ts - (ts % seconds_per)
    if key == "D":
        return _eastern_midnight(ts)
    if key == "W":
        return _eastern_week_start(ts)
    if key == "M":
        return _eastern_month_start(ts)
    return _start_of_minute_ts(ts)

def _seed(price: float, ts: int) -> dict:
    return {"timestamp": ts, "open": price, "high": price, "low": price, "close": price, "volume": 0}

def _cap(lst: list[dict], key: str) -> list[dict]:
    lim = HISTORY_LIMITS.get(key)
    if not lim or len(lst) <= lim: return lst
    return lst[-lim:]

async def ensure_stock_histories(symbols: list[str]):
    for sym in symbols:
        try:
            symbol = sym.upper()
            existing = await asyncio.to_thread(stock_histories_collection.find_one, {"symbol": symbol})
            if existing:
                continue

            histories: dict[str, list] = {k: [] for k in INCREMENTS.keys()}

            # Daily/Weekly/Monthly first (works after hours)
            for key in ("D", "W", "M"):
                yf_res = RESOLUTION_MAP[key]
                try:
                    h = await get_stock_history(symbol.replace(".", "-"), yf_res)
                    if "history" in h and h["history"]:
                        histories[key] = _cap(h["history"], key)
                        print(f"✅ {symbol}: init {len(histories[key])} [{key}]")
                except Exception as e:
                    print(f"⚠️ {symbol}: init {key} error: {e}")

            # Intraday (best effort; may be empty off-hours)
            for key in ("60", "30", "15", "5", "1"):
                yf_res = RESOLUTION_MAP[key]
                try:
                    h = await get_stock_history(symbol.replace(".", "-"), yf_res)
                    if "history" in h and h["history"]:
                        histories[key] = _cap(h["history"], key)
                        print(f"✅ {symbol}: init {len(histories[key])} [{key}]")
                except Exception as e:
                    print(f"⚠️ {symbol}: init {key} error: {e}")

            # If nothing came back, seed from Mongo price
            if all(len(v) == 0 for v in histories.values()):
                price_doc = await asyncio.to_thread(stock_prices_collection.find_one, {"symbol": symbol})
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
                stock_histories_collection.update_one,
                {"symbol": symbol},
                {"$set": {"symbol": symbol, "histories": histories, "updatedAt": int(time.time())}},
                upsert=True,
            )
            print(f"✅ Initialized histories for {symbol}")

        except Exception as e:
            print(f"❌ Error initializing {sym}: {e}")

async def update_stock_histories(symbols: list[str]):
    try:
        status = await is_market_open()
        open_now = bool(status.get("isOpen", False))
    except Exception as e:
        print(f"⚠️ is_market_open check failed: {e}; skipping this minute")
        return

    if not open_now:
        print("⏸️ Market closed — skipping stock history update this minute")
        return

    now_ts = _start_of_minute_ts()

    for sym in symbols:
        try:
            symbol = sym.upper()

            price_doc = await asyncio.to_thread(stock_prices_collection.find_one, {"symbol": symbol})
            if not price_doc or "price" not in price_doc:
                continue
            current_price = float(price_doc["price"])

            doc = await asyncio.to_thread(stock_histories_collection.find_one, {"symbol": symbol})
            if not doc:
                histories = {}
                for k, seconds_per in INCREMENTS.items():
                    cs = _candle_start(now_ts, k, seconds_per)
                    histories[k] = _cap([_seed(current_price, cs)], k)
                await asyncio.to_thread(
                    stock_histories_collection.update_one,
                    {"symbol": symbol},
                    {"$set": {"symbol": symbol, "histories": histories, "updatedAt": now_ts}},
                    upsert=True,
                )
                print(f"🟡 {symbol}: created fresh histories with aligned seed")
                continue

            histories: dict = doc.get("histories", {}) or {}
            changed = False

            for key, seconds_per in INCREMENTS.items():
                candles: list[dict] = histories.get(key, [])
                cs = _candle_start(now_ts, key, seconds_per)

                if not candles:
                    histories[key] = _cap([_seed(current_price, cs)], key)
                    changed = True
                    continue

                last = candles[-1]
                last_ts = int(last["timestamp"])

                if cs > last_ts:
                    # append new candle at candle-start
                    last_close = last["close"]
                    candles.append({
                        "timestamp": cs,
                        "open": last_close,
                        "high": max(last_close, current_price),
                        "low":  min(last_close, current_price),
                        "close": current_price,
                        "volume": 0,
                    })
                    histories[key] = _cap(candles, key)
                    changed = True
                else:
                    # update current candle
                    last["close"] = current_price
                    last["high"] = max(last["high"], current_price)
                    last["low"]  = min(last["low"],  current_price)
                    histories[key] = _cap(candles, key)
                    changed = True

            if changed:
                await asyncio.to_thread(
                    stock_histories_collection.update_one,
                    {"symbol": symbol},
                    {"$set": {"histories": histories, "updatedAt": now_ts}},
                )

        except Exception as e:
            print(f"⚠️ Error updating {sym}: {e}")


async def run_stock_history_loop(symbols: list[str]):
    await ensure_stock_histories(symbols)
    while True:
        try:
            await update_stock_histories(symbols)
            print("📈 Stock histories updated")
        except Exception as e:
            print(f"❌ History loop error: {e}")
        await asyncio.sleep(60 - time.time() % 60)