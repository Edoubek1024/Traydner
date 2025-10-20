from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, Any, Dict, Tuple
import time

from app.core.auth_dependencies import get_current_user_from_api_key
from app.services.stock_service import stock_trade, get_current_price, get_stock_history_db
from app.services.crypto_service import crypto_trade, get_crypto_price_db, get_crypto_history_db
from app.services.forex_service import forex_trade, get_current_forex_price, get_forex_history_db
from app.services.user_service import get_user_balance
from app.core.symbols import STOCK_SYMBOLS, CRYPTO_SYMBOLS, FOREX_SYMBOLS

router = APIRouter(prefix="/api/remote", tags=["Remote"])

# ---- NEW: robust price coercion (route-level only) --------------------------
def _coerce_price_payload(raw: Any, market: str, symbol: str) -> Tuple[float, Dict[str, Any]]:
    """
    Accept common shapes (float/dict/tuple/list) from service functions and
    return (price: float, meta: {source, updatedAt}). Raise 502 on unusable data.
    """
    # float/int -> good
    if isinstance(raw, (int, float)):
        return float(raw), {"source": f"{market}_svc", "updatedAt": int(time.time())}

    # dict with common keys
    if isinstance(raw, dict):
        for key in ("price", "last", "value", "close"):
            if key in raw and raw[key] is not None:
                try:
                    price = float(raw[key])
                except Exception:
                    break
                return price, {
                    "source": raw.get("source", f"{market}_svc"),
                    "updatedAt": raw.get("updatedAt", int(time.time())),
                }
        # Couldn't find a usable key
        raise HTTPException(
            status_code=502,
            detail=f"{market} price payload for {symbol} missing usable price key (got keys: {list(raw.keys())})",
        )

    # tuple/list like (price, ts) or [price, ...]
    if isinstance(raw, (tuple, list)) and raw:
        if isinstance(raw[0], (int, float)):
            return float(raw[0]), {"source": f"{market}_svc", "updatedAt": int(time.time())}

    # Anything else -> 502 with type info
    raise HTTPException(
        status_code=502,
        detail=f"{market} price payload for {symbol} not supported (type={type(raw).__name__}, value={raw!r})",
    )
# -----------------------------------------------------------------------------

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
        raw = await get_current_price(symbol)
        price, _meta = _coerce_price_payload(raw, "stock", symbol)
        qty_int = int(quantity)
        if qty_int <= 0:
            raise HTTPException(status_code=400, detail="Stock quantity must be a positive integer")
        result = await stock_trade(symbol, action, qty_int, price, uid)

    elif symbol in CRYPTO_SYMBOLS:
        raw = await get_crypto_price_db(symbol)
        price, _meta = _coerce_price_payload(raw, "crypto", symbol)
        result = await crypto_trade(symbol, action, float(quantity), price, uid)

    elif symbol in FOREX_SYMBOLS:
        raw = await get_current_forex_price(symbol)
        price, _meta = _coerce_price_payload(raw, "forex", symbol)
        result = await forex_trade(symbol, action, float(quantity), price, uid)

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

    if sym in STOCK_SYMBOLS:
        market = "stock"
        raw = await get_current_price(sym)
    elif sym in CRYPTO_SYMBOLS:
        market = "crypto"
        raw = await get_crypto_price_db(sym)
    elif sym in FOREX_SYMBOLS:
        market = "forex"
        raw = await get_current_forex_price(sym)
    else:
        raise HTTPException(status_code=400, detail="Symbol not found or unsupported")

    price, meta = _coerce_price_payload(raw, market, sym)

    return {
        "symbol": sym,
        "market": market,
        "price": float(price),
        "source": meta.get("source"),
        "updatedAt": meta.get("updatedAt"),
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
