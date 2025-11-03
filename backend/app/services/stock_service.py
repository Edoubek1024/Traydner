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

def _to_seconds(ts: int | None) -> int | None:
    """
    Accept ms or seconds from callers and normalize to seconds.
    """
    if ts is None:
        return None
    ts = int(ts)
    return ts // 1000 if ts >= 10**12 else ts

def _candle_ts_s(c: dict) -> int:
    """
    Robustly read a candle's timestamp as seconds (handles str/float/ms).
    """
    ts = c.get("timestamp", 0)
    try:
        ts = int(float(ts))
    except Exception:
        ts = 0
    return ts // 1000 if ts >= 10**12 else ts

def _normalize_window(start_ts: int | None, end_ts: int | None) -> tuple[int, int]:
    """
    Build an inclusive start / exclusive end window in seconds.
    """
    s = _to_seconds(start_ts) if start_ts is not None else -10**18
    e = _to_seconds(end_ts)   if end_ts   is not None else  10**18
    if e <= s:
        e = s + 1
    return s, e

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

def _yf_params_from_db_key(db_key: str) -> tuple[str, str]:
    """
    Map our normalized DB key to Yahoo (period, interval).
    """
    if db_key == "1":   return ("1d",  "1m")
    if db_key == "5":   return ("60d", "5m")
    if db_key == "15":  return ("60d", "15m")
    if db_key == "30":  return ("60d", "30m")
    if db_key == "60":  return ("730d","60m")
    if db_key == "D":   return ("5y",  "1d")
    if db_key == "W":   return ("10y", "1wk")
    if db_key == "M":   return ("10y", "1mo")
    raise ValueError(f"Unsupported resolution key: {db_key}")

async def get_stock_history(
    symbol: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    try:
        import yfinance as yf
        key = _normalize_stock_res_key(resolution)          # <- normalize aliases (handles "M" vs "1m")
        period, interval = _yf_params_from_db_key(key)

        # accept ms or s from callers
        s_ts = _to_seconds(start_ts)
        e_ts = _to_seconds(end_ts)

        ticker = yf.Ticker(symbol)

        def load():
            # Intraday must use 'period' with Yahoo
            if interval.endswith("m"):
                return ticker.history(period=period, interval=interval)

            # Daily/weekly/monthly: if both bounds provided, use start/end; else fall back to period
            if s_ts is not None and e_ts is not None:
                return ticker.history(
                    start=datetime.utcfromtimestamp(int(s_ts)),
                    end=datetime.utcfromtimestamp(int(e_ts)),
                    interval=interval,
                )
            return ticker.history(period=period, interval=interval)

        df = await asyncio.to_thread(load)

        if df is None or df.empty:
            return {"symbol": symbol.upper(), "resolution": key, "history": []}

        # Ensure UTC timestamps (seconds)
        if df.index.tz is None:
            idx_utc = [dt.replace(tzinfo=dt_timezone.utc) for dt in df.index.to_pydatetime()]
        else:
            idx_utc = [dt.astimezone(dt_timezone.utc) for dt in df.index.to_pydatetime()]

        rows = []
        for idx_dt_utc, r in zip(idx_utc, df.to_dict("records")):
            rows.append({
                "timestamp": int(idx_dt_utc.timestamp()),
                "open":   float(r.get("Open",   0) or 0),
                "high":   float(r.get("High",   0) or 0),
                "low":    float(r.get("Low",    0) or 0),
                "close":  float(r.get("Close",  0) or 0),
                "volume": int(  r.get("Volume", 0) or 0),
            })

        # Keep most recent N, preserve order
        if limit and len(rows) > limit:
            rows = rows[-limit:]

        return {"symbol": symbol.upper(), "resolution": key, "history": rows}

    except Exception as e:
        return {"error": str(e), "trace": traceback.format_exc()}


    
async def stock_trade(symbol: str, action: str, quantity: int, price: float, user_id: str) -> dict:
    try:
        if action not in {"buy", "sell"}:
            return {"error": "Invalid trade action. Must be 'buy' or 'sell'."}
        if quantity <= 0 or price <= 0:
            return {"error": "Quantity and price must be greater than zero."}
        
        market_status = await is_market_open()

        if not market_status["isOpen"]:
            return {"error": "Stock trades can only be made while the stock market is open."}
        
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
    r = resolution.strip().lower()
    if r in {"1", "1m", "m1", "1min", "1minute"}: return "1"
    if r in {"5", "5m", "m5"}: return "5"
    if r in {"15","15m","m15"}: return "15"
    if r in {"30","30m","m30"}: return "30"
    if r in {"60","60m","m60","1h","h1"}: return "60"
    if r in {"d","1d","day"}: return "D"
    if r in {"w","1w","wk","1wk","week"}: return "W"
    if r in {"m","1mo","mo","month","1month"}: return "M"
    return resolution.upper()

async def get_stock_history_db(
    symbol: str,
    resolution: str,
    start_ts: Optional[int] = None,
    end_ts: Optional[int] = None,
    limit: int = 500,
) -> Dict[str, Any]:
    sym = symbol.upper()
    key = _normalize_stock_res_key(resolution)

    doc = await asyncio.to_thread(stock_histories_collection.find_one, {"symbol": sym})
    if not doc or "histories" not in doc:
        return {"symbol": sym, "resolution": key, "history": []}

    candles: List[Dict[str, Any]] = (doc["histories"] or {}).get(key, []) or []

    # Ensure ASC (robust against out-of-order appends)
    if candles:
        candles = sorted(candles, key=_candle_ts_s)

    # Normalize and apply time window (EXCLUSIVE end)
    if start_ts is not None or end_ts is not None:
        s, e = _normalize_window(start_ts, end_ts)
        candles = [c for c in candles if s <= _candle_ts_s(c) < e]

    # Apply limit (keep most recent N while preserving ASC)
    if limit and len(candles) > limit:
        candles = candles[-limit:]

    return {
        "symbol": sym,
        "resolution": key,
        "history": candles,
        "source": "mongo",
        "updatedAt": doc.get("updatedAt"),
    }