import time
import traceback
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime
from datetime import time as dt_time
from pytz import timezone
from datetime import timezone as dt_timezone
import holidays
from app.db.mongo import stock_prices_collection, users_collection, trades_collection, stock_histories_collection

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

# stock_service.py
async def get_stock_history(
    symbol: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)

        # Yahoo-friendly mapping
        res_map = {
            "1m": ("1d",  "1m"),
            "5m": ("60d", "5m"),
            "15m":("60d", "15m"),
            "30m":("60d", "30m"),
            "60m":("730d","60m"),
            "1d": ("5y",  "1d"),
            "1wk":("10y",  "1wk"),
            "1mo":("10y",  "1mo"),
        }
        if resolution not in res_map:
            return {"error": f"Unsupported resolution: {resolution}"}

        period, interval = res_map[resolution]

        def load():
            # For intraday, Yahoo requires period; for daily+ we can use start/end if provided.
            if period:
                return ticker.history(period=period, interval=interval)
            if start_ts and end_ts:
                return ticker.history(
                    start=datetime.utcfromtimestamp(start_ts),
                    end=datetime.utcfromtimestamp(end_ts),
                    interval=interval,
                )
            # fallback small-ish period instead of 5y
            return ticker.history(period="5y", interval=interval)

        df = await asyncio.to_thread(load)
        if df.index.tz is None:
            idx_utc = [dt.replace(tzinfo=dt_timezone.utc) for dt in df.index.to_pydatetime()]
        else:
            idx_utc = [dt.astimezone(dt_timezone.utc) for dt in df.index.to_pydatetime()]

        rows = []
        for idx_dt_utc, r in zip(idx_utc, df.to_dict("records")):
            rows.append({
                "timestamp": int(idx_dt_utc.timestamp()),  # <-- correct, UTC epoch seconds
                "open":   float(r.get("Open",   0)),
                "high":   float(r.get("High",   0)),
                "low":    float(r.get("Low",    0)),
                "close":  float(r.get("Close",  0)),
                "volume": int(  r.get("Volume", 0) or 0),
            })

        
        if limit and len(rows) > limit:
            rows = rows[-limit:]

        return {"symbol": symbol.upper(), "resolution": resolution, "history": rows}
    except Exception as e:
        return {"error": str(e), "trace": traceback.format_exc()}

    
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
    
def _normalize_stock_res_key(resolution: str) -> str:
    key = resolution.upper()
    # normalize common inputs
    if key in {"1", "1M", "1MIN", "1MINUTE"}: return "1"
    if key in {"5", "5M"}: return "5"
    if key in {"15", "15M"}: return "15"
    if key in {"30", "30M"}: return "30"
    if key in {"60", "60M", "1H"}: return "60"
    if key in {"D", "1D", "DAY"}: return "D"
    if key in {"W", "1W", "WEEK"}: return "W"
    return key

async def get_stock_history_db(
    symbol: str,
    resolution: str,
    start_ts: Optional[int] = None,
    end_ts: Optional[int] = None,
    limit: int = 500,
) -> Dict[str, Any]:
    """
    Return candles from Mongo (ASC). Applies:
      1) time-window filter with exclusive end (s <= ts < e)
      2) then limit (last N)
    """
    sym = symbol.upper()
    key = _normalize_stock_res_key(resolution)

    doc = await asyncio.to_thread(stock_histories_collection.find_one, {"symbol": sym})
    if not doc or "histories" not in doc:
        return {"symbol": sym, "resolution": key, "history": []}

    candles: List[Dict[str, Any]] = (doc["histories"] or {}).get(key, []) or []

    # sort ASC defensively (some writers can append out-of-order)
    if candles and (len(candles) > 1) and (candles[0]["timestamp"] > candles[-1]["timestamp"]):
        candles = sorted(candles, key=lambda c: int(c.get("timestamp", 0)))
    # (cheap check) ensure ASC
    elif candles and any(candles[i]["timestamp"] > candles[i+1]["timestamp"] for i in range(len(candles)-1)):
        candles = sorted(candles, key=lambda c: int(c.get("timestamp", 0)))

    # filter by window (end is EXCLUSIVE)
    if start_ts is not None or end_ts is not None:
        s = int(start_ts) if start_ts is not None else -10**18
        e = int(end_ts)   if end_ts   is not None else  10**18
        # EXCLUSIVE end fixes 1D day window off-by-one issues
        candles = [c for c in candles if s <= int(c.get("timestamp", 0)) < e]

    # apply limit (take the most recent N, but keep ASC order)
    if limit and len(candles) > limit:
        candles = candles[-limit:]

    return {
        "symbol": sym,
        "resolution": key,
        "history": candles,
        "source": "mongo",
        "updatedAt": doc.get("updatedAt"),
    }