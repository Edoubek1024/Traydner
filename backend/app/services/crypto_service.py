import asyncio
import time
import traceback
import httpx
from app.db.mongo import crypto_prices_collection, users_collection, trades_collection

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
        "symbol": f"{symbol.upper()}USDT",
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
        
        total_cost = quantity * price

        user = await asyncio.to_thread(users_collection.find_one, {"uid": user_id})
        if not user:
            return {"error": "User not found."}

        balance = user.get("balance", {"cash": 0, "crypto": {}})
        balance.setdefault("crypto", {})

        if action == "buy":
            if balance["cash"] < total_cost:
                return {"error": "Insufficient cash balance."}

            balance["cash"] -= total_cost
            balance["crypto"][symbol] = balance["crypto"].get(symbol, 0.0) + quantity

        elif action == "sell":
            current_quantity = balance["crypto"].get(symbol, 0.0)
            if current_quantity < quantity:
                return {"error": f"Insufficient {symbol} to sell."}

            balance["crypto"][symbol] = current_quantity - quantity
            balance["cash"] += total_cost

            if balance["crypto"][symbol] == 0:
                del balance["crypto"][symbol]

        await asyncio.to_thread(
            users_collection.update_one,
            {"uid": user_id},
            {"$set": {"balance": balance}}
        )

        trade_doc = {
            "userId": user_id,
            "symbol": symbol.upper(),
            "action": action,
            "quantity": quantity,
            "price": price,
            "total": total_cost,
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