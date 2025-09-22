import asyncio
import time
import traceback
import httpx
from app.db.mongo import crypto_prices_collection, users_collection, trades_collection
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

async def get_crypto_history(symbol: str, resolution: str, start_ts: int | None = None, end_ts: int | None = None, limit: int = 1000) -> dict:
    interval = CRYPTO_RES_MAP.get(resolution.upper())
    if not interval:
        return {"error": f"Unsupported resolution: {resolution}"}

    params = {
        "symbol": f"{symbol.upper()}USD",
        "interval": interval,
        "limit": min(max(limit, 1), 1000),
    }
    if start_ts:
        params["startTime"] = int(start_ts) * 1000
    if end_ts:
        params["endTime"] = int(end_ts) * 1000

    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(BINANCE_KLINES, params=params)
        r.raise_for_status()
        klines = r.json()
    
    history = [
        {
            "timestamp": k[0] // 1000,
            "open": float(k[1]),
            "high": float(k[2]),
            "low": float(k[3]),
            "close": float(k[4]),
            "volume": float(k[5]),
        }
        for k in klines
    ]

    return {
        "symbol": symbol.upper(),
        "resolution": resolution,
        "history": history,
    }

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