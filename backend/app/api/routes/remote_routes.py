from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from app.core.auth_dependencies import get_current_user_from_api_key
from app.services.stock_service import stock_trade, get_current_price, get_stock_history_db
from app.services.crypto_service import crypto_trade, get_crypto_price_db, get_crypto_history_db
from app.services.forex_service import forex_trade, get_current_forex_price, get_forex_history_db
from app.services.user_service import get_user_balance
from app.core.symbols import STOCK_SYMBOLS, CRYPTO_SYMBOLS, FOREX_SYMBOLS

router = APIRouter(prefix="/api/remote", tags=["Remote"])

@router.post("/trade")
async def execute_trade(
    symbol: str,
    side: str,
    quantity: float,
    user = Depends(get_current_user_from_api_key)
):
    symbol = symbol.upper()
    action = side.lower()
    if action not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Side must be 'buy' or 'sell'")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    uid = user.get("user_uid")
    if not uid:
        raise HTTPException(status_code=500, detail="Authenticated user missing uid")

    if symbol in STOCK_SYMBOLS:
        gp = await get_current_price(symbol)
        price = gp.get("price")
        if price is None:
            raise HTTPException(status_code=502, detail="Stock price could not be fetched")
        qty_int = int(quantity)
        if qty_int <= 0:
            raise HTTPException(status_code=400, detail="Stock quantity must be a positive integer")
        result = await stock_trade(symbol, action, qty_int, float(price), uid)

    elif symbol in CRYPTO_SYMBOLS:
        gp = await get_crypto_price_db(symbol)
        price = gp.get("price")
        if price is None:
            raise HTTPException(status_code=502, detail="Crypto price could not be fetched")
        result = await crypto_trade(symbol, action, float(quantity), float(price), uid)

    elif symbol in FOREX_SYMBOLS:
        gp = await get_current_forex_price(symbol)
        price = gp.get("price")
        if price is None:
            raise HTTPException(status_code=502, detail="Forex price could not be fetched")
        result = await forex_trade(symbol, action, float(quantity), float(price), uid)

    else:
        raise HTTPException(status_code=400, detail="Symbol not found or unsupported")

    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["error"])

    return {
        "status": "success",
        "trade": {
            "symbol": symbol,
            "side": action,
            "quantity": quantity,
            "price": price,
            "executed_by_uid": uid,
        },
        "result": result,
    }

@router.get("/balance")
async def get_my_balance_remote(user = Depends(get_current_user_from_api_key)):
    uid = user.get("user_uid")
    if not uid:
        raise HTTPException(status_code=500, detail="Authenticated user missing uid")

    balance = get_user_balance(uid)

    return {"balance": balance}

@router.get("/price")
async def get_price(
    symbol: str,
    _user = Depends(get_current_user_from_api_key)
):
    sym = symbol.upper()

    market = None
    data = None

    if sym in STOCK_SYMBOLS:
        market = "stock"
        data = await get_current_price(sym)
    elif sym in CRYPTO_SYMBOLS:
        market = "crypto"
        data = await get_crypto_price_db(sym)
    elif sym in FOREX_SYMBOLS:
        market = "forex"
        data = await get_current_forex_price(sym)
    else:
        raise HTTPException(status_code=400, detail="Symbol not found or unsupported")

    price = (data or {}).get("price")
    if price is None:
        raise HTTPException(status_code=502, detail="Price could not be fetched")

    return {
        "symbol": sym,
        "market": market,
        "price": float(price),
        "source": (data or {}).get("source"),
        "updatedAt": (data or {}).get("updatedAt"),
    }

@router.get("/history")
async def get_history(
    symbol: str = Query(..., description="Trading symbol, e.g. AAPL, BTC-USD, EURUSD"),
    resolution: str = Query(..., description="Resolution, e.g. 1m, 5m, 1h, D, W, etc."),
    start_ts: Optional[int] = Query(None, description="Start timestamp (optional, Unix seconds)"),
    end_ts: Optional[int] = Query(None, description="End timestamp (optional, Unix seconds)"),
    limit: int = Query(500, ge=1, le=5000, description="Maximum number of candles to return"),
    _user = Depends(get_current_user_from_api_key),
):
    """
    Fetch recent historical candles for a given symbol and resolution.
    Works for stocks, crypto, and forex.
    """
    sym = symbol.upper()

    if sym in STOCK_SYMBOLS:
        market = "stock"
        data = await get_stock_history_db(sym, resolution, start_ts, end_ts, limit)
    elif sym in CRYPTO_SYMBOLS:
        market = "crypto"
        data = await get_crypto_history_db(sym, resolution, start_ts, end_ts, limit)
    elif sym in FOREX_SYMBOLS:
        market = "forex"
        data = await get_forex_history_db(sym, resolution, start_ts, end_ts, limit)
    else:
        raise HTTPException(status_code=400, detail="Symbol not found or unsupported")

    if not data or "error" in data:
        raise HTTPException(status_code=404, detail=f"No historical data found for {sym}")

    candles = data.get("history", [])
    if not candles:
        raise HTTPException(status_code=404, detail=f"No historical candles for {sym}")

    return {
        "symbol": sym,
        "market": market,
        "resolution": data.get("resolution"),
        "count": len(candles),
        "history": candles,
        "source": data.get("source", "mongo"),
        "updatedAt": data.get("updatedAt"),
    }