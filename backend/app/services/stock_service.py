import time
import traceback
import yfinance as yf
import asyncio
from datetime import datetime
from datetime import time as dt_time
from pytz import timezone
import holidays
from app.db.mongo import stock_prices_collection, users_collection, trades_collection

async def get_user_balance(uid: str) -> dict:
    user = await asyncio.to_thread(users_collection.find_one, {"uid": uid})
    if not user:
        raise ValueError("User not found")

    balance = user.get("balance", {"cash": 0, "stocks": {}})
    return balance

async def is_market_open() -> dict:
    eastern = timezone("US/Eastern")
    us_holidays = holidays.US()
    now = datetime.now(eastern)

    is_weekday = now.weekday() < 5
    is_holiday = now.date() in us_holidays
    is_open_hours = dt_time(9, 30) <= now.time() <= dt_time(16, 0)

    return {
        "isOpen": is_weekday and not is_holiday and is_open_hours,
        "time": now.isoformat(),
    }


async def get_current_price(symbol: str) -> dict:
    def fetch():
        return stock_prices_collection.find_one({"symbol": symbol.upper()})
    
    doc = await asyncio.to_thread(fetch)

    if doc and "price" in doc:
        return {
            "symbol": symbol.upper(),
            "price": doc["price"],
            "updatedAt": doc.get("updatedAt")
        }
    else:
        return {
            "symbol": symbol.upper(),
            "error": "Price not found in database"
        }



async def get_stock_history(symbol: str, resolution: str) -> dict:
    try:
        ticker = yf.Ticker(symbol)

        resolution_map = {
            "1m": ("7d", "1m"),
            "5m": ("60d", "5m"),
            "15m": ("60d", "15m"),
            "30m": ("60d", "30m"),
            "60m": ("730d", "60m"),
            "1d": ("5y", "1d"),
            "1wk": ("5y", "1wk"),
            "1mo": ("5y", "1mo"),
        }

        if resolution not in resolution_map:
            return {"error": f"Unsupported resolution: {resolution}"}

        period, interval = resolution_map[resolution]
        df = ticker.history(period=period, interval=interval)

        history = [
            {
                "timestamp": int(time.mktime(idx.timetuple())),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"])
            }
            for idx, row in df.iterrows()
        ]

        return {
            "symbol": symbol.upper(),
            "resolution": resolution,
            "history": history
        }

    except Exception as e:
        return {
            "error": str(e),
            "trace": traceback.format_exc()
        }
    
async def stock_trade(symbol: str, action: str, quantity: int, price: float, user_id: str) -> dict:
    try:
        if action not in {"buy", "sell"}:
            return {"error": "Invalid trade action. Must be 'buy' or 'sell'."}
        if quantity <= 0 or price <= 0:
            return {"error": "Quantity and price must be greater than zero."}
        
        total_cost = quantity * price

        user = await asyncio.to_thread(users_collection.find_one, {"uid": user_id})
        if not user:
            return {"error": "User not found."}

        balance = user.get("balance", {"cash": 0, "stocks": {}})

        if action == "buy":
            if balance["cash"] < total_cost:
                return {"error": "Insufficient cash balance."}

            balance["cash"] -= total_cost
            balance["stocks"][symbol] = balance["stocks"].get(symbol, 0) + quantity

        elif action == "sell":
            current_quantity = balance["stocks"].get(symbol, 0)
            if current_quantity < quantity:
                return {"error": "Insufficient shares to sell."}

            balance["stocks"][symbol] = current_quantity - quantity
            balance["cash"] += total_cost

            if balance["stocks"][symbol] == 0:
                del balance["stocks"][symbol]

        await asyncio.to_thread(users_collection.update_one,
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
            "timestamp": time.time()
        }
        result = await asyncio.to_thread(trades_collection.insert_one, trade_doc)
        trade_doc["_id"] = str(result.inserted_id)

        return {"status": "success", "trade": trade_doc, "balance": balance}

    except Exception as e:
        print("❌ Backend trade error:", e)
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}