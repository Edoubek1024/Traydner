import asyncio
import time
import traceback
import httpx
from app.db.mongo import crypto_prices_collection, users_collection, trades_collection, crypto_histories_collection
from decimal import Decimal, ROUND_HALF_UP, getcontext
getcontext().prec = 28

CRYPTO_RES_MAP = {
    "1": "1m",
    "5": "5m",
    "15": "15m",
    "30": "30m",
    "60": "1h",
    "120": "2h",
    "240": "4h",
    "D": "1d",
    "W": "1w",
    "M": "1M",
}
USD = Decimal("0.01")
CRYPTO = Decimal("0.00000001")

BINANCE_KLINES = "https://api.binance.us/api/v3/klines"

def _hosts_for_resolution(res: str):
    key = _normalize_crypto_res_key(res)
    if key in {"D", "W", "M"}:
        return [("binance.com", "USDT"), ("binance.us", "USDT")]
    return [
        ("binance.us",  "USD"),
        ("binance.us",  "USDT"),
        ("binance.com", "USDT"),
        ("binance.com", "BUSD"),
    ]

def _to_seconds(ts: int | None) -> int | None:
    """
    Accept ms or seconds from callers and normalize to seconds.
    """
    if ts is None:
        return None
    ts = int(ts)
    return ts // 1000 if ts >= 10**12 else ts


def _candle_ts_s(c: dict) -> int:
    """Robustly read a candle's timestamp as seconds (handles str/float/ms)."""
    ts = c.get("timestamp", 0)
    try:
        ts = int(float(ts))
    except Exception:
        ts = 0
    return ts // 1000 if ts >= 10**12 else ts

def _normalize_crypto_res_key(res: str) -> str:
    """
    Map common aliases to internal keys:
    {"1","5","15","30","60","120","240","D","W","M"}
    """
    r = (res or "").strip().lower()
    # minutes
    if r in {"1","1m","m1"}: return "1"
    if r in {"5","5m","m5"}: return "5"
    if r in {"15","15m","m15"}: return "15"
    if r in {"30","30m","m30"}: return "30"
    # hours
    if r in {"60","60m","m60","1h","h1"}: return "60"
    if r in {"120","120m","m120","2h","h2"}: return "120"
    if r in {"240","240m","m240","4h","h4"}: return "240"
    # higher TF
    if r in {"d","1d","day"}: return "D"
    if r in {"w","1w","wk","1wk","week"}: return "W"
    if r in {"m","1mo","mo","month","1month"}: return "M"
    return r.upper()


async def get_user_crypto_balance(uid: str) -> dict:
    user = await asyncio.to_thread(users_collection.find_one, {"uid": uid})
    if not user:
        raise ValueError("User not found")

    balance = user.get("balance", {"cash": 0, "crypto": {}})
    return balance

async def get_crypto_price_db(symbol: str) -> float:
    sym = symbol.upper()
    doc = await asyncio.to_thread(crypto_prices_collection.find_one, {"symbol": sym})
    if not doc or "price" not in doc:
        raise ValueError(f"Price for {sym} not found in database")
    return float(doc["price"])

async def get_crypto_history(
    symbol: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 1000,
) -> dict:
    key = _normalize_crypto_res_key(resolution)
    interval = CRYPTO_RES_MAP.get(key)
    if not interval:
        return {"error": f"Unsupported resolution: {resolution} (normalized='{key}')"}

    sym = (symbol or "").strip().upper()
    params_base = {
        "interval": interval,
        "limit": min(max(int(limit), 1), 1000),
    }

    # accept ms or s; Binance expects ms
    s = _to_seconds(start_ts) if start_ts is not None else None
    e = _to_seconds(end_ts)   if end_ts   is not None else None
    if s is not None:
        params_base["startTime"] = int(s) * 1000
    if e is not None:
        params_base["endTime"] = int(e) * 1000  # we'll still enforce exclusive end locally if needed

    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for host, quote in _hosts_for_resolution(key):
            pair = f"{sym}{quote}"
            url = f"https://api.{host}/api/v3/klines"
            try:
                r = await client.get(url, params={"symbol": pair, **params_base})
                r.raise_for_status()
                klines = r.json()
                # Binance returns [ openTime, open, high, low, close, volume, ... ]
                history = []
                for k in klines:
                    ts_s = k[0] // 1000
                    # enforce inclusive start / EXCLUSIVE end if provided
                    if s is not None and ts_s < s:
                        continue
                    if e is not None and not (ts_s < e):
                        continue
                    history.append({
                        "timestamp": ts_s,
                        "open":   float(k[1]),
                        "high":   float(k[2]),
                        "low":    float(k[3]),
                        "close":  float(k[4]),
                        "volume": float(k[5]),
                    })

                if history:
                    # keep only the most recent N, preserve ASC
                    if limit and len(history) > limit:
                        history = history[-limit:]

                    return {
                        "symbol": sym,
                        "resolution": key,       # normalized key
                        "history": history,
                        "source": f"{host}:{pair}",
                    }
            except Exception:
                continue

    return {"symbol": sym, "resolution": key, "history": []}

async def crypto_trade(symbol: str, action: str, quantity: float, price: float, user_id: str) -> dict:
    try:
        if action not in {"buy", "sell"}:
            return {"error": "Invalid trade action. Must be 'buy' or 'sell'."}
        if quantity <= 0 or price <= 0:
            return {"error": "Quantity and price must be greater than zero."}

        # Convert via str to avoid inheriting binary float error
        q = Decimal(str(quantity)).quantize(CRYPTO, rounding=ROUND_HALF_UP)
        p = Decimal(str(price))  # keep full precision for price
        total = (q * p).quantize(USD, rounding=ROUND_HALF_UP)

        user = await asyncio.to_thread(users_collection.find_one, {"uid": user_id})
        if not user:
            return {"error": "User not found."}

        balance = user.get("balance", {"cash": 0, "crypto": {}})
        balance.setdefault("crypto", {})

        cash = Decimal(str(balance.get("cash", 0))).quantize(USD, rounding=ROUND_HALF_UP)
        cur_q = Decimal(str(balance["crypto"].get(symbol, 0))).quantize(CRYPTO, rounding=ROUND_HALF_UP)

        if action == "buy":
            if cash < total:
                return {"error": "Insufficient cash balance."}
            cash = (cash - total).quantize(USD, rounding=ROUND_HALF_UP)
            cur_q = (cur_q + q).quantize(CRYPTO, rounding=ROUND_HALF_UP)

        else:  # sell
            if cur_q < q:
                return {"error": f"Insufficient {symbol} to sell."}
            cur_q = (cur_q - q).quantize(CRYPTO, rounding=ROUND_HALF_UP)
            cash = (cash + total).quantize(USD, rounding=ROUND_HALF_UP)

        # write back as plain numbers (or switch to Mongo Decimal128 if you prefer)
        balance["cash"] = float(cash)
        if cur_q == 0:
            balance["crypto"].pop(symbol, None)
        else:
            balance["crypto"][symbol] = float(cur_q)

        await asyncio.to_thread(
            users_collection.update_one,
            {"uid": user_id},
            {"$set": {"balance": balance}}
        )

        trade_doc = {
            "userId": user_id,
            "symbol": symbol.upper(),
            "action": action,
            "quantity": float(q),
            "price": float(p),
            "total": float(total),
            "timestamp": time.time(),
            "type": "crypto"
        }
        result = await asyncio.to_thread(trades_collection.insert_one, trade_doc)
        trade_doc["_id"] = str(result.inserted_id)

        return {"status": "success", "trade": trade_doc, "balance": balance}

    except Exception as e:
        print("❌ Backend crypto trade error:", e)
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}

async def get_crypto_history_db(
    symbol: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    sym = (symbol or "").strip().upper()
    key = _normalize_crypto_res_key(resolution)

    doc = await asyncio.to_thread(crypto_histories_collection.find_one, {"symbol": sym})
    if not doc or "histories" not in doc:
        return {"error": f"No stored histories for {sym}."}

    candles = (doc["histories"] or {}).get(key, []) or []
    if not candles:
        return {"symbol": sym, "resolution": key, "history": []}

    # Ensure ASC
    candles = sorted(candles, key=_candle_ts_s)

    # Inclusive start / EXCLUSIVE end, accept ms or s
    if start_ts is not None or end_ts is not None:
        s = _to_seconds(start_ts) if start_ts is not None else -10**18
        e = _to_seconds(end_ts)   if end_ts   is not None else  10**18
        if e <= s:
            e = s + 1
        candles = [c for c in candles if s <= _candle_ts_s(c) < e]

    # Limit most recent N, keep ASC
    if limit and len(candles) > limit:
        candles = candles[-limit:]

    return {
        "symbol": sym,
        "resolution": key,
        "history": candles,
        "source": "mongo",
        "updatedAt": doc.get("updatedAt"),
    }
