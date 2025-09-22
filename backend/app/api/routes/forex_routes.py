from fastapi import APIRouter, Query, HTTPException, Depends
from typing import Optional, List, Dict, Any
from app.db.mongo import forex_prices_collection
from app.services.forex_service import get_current_forex_price, get_forex_history, get_user_forex_balance, forex_trade, get_forex_market_status
from typing import Literal
from pydantic import BaseModel

from app.firebase.firebase_auth import firebase_user

router = APIRouter(prefix="/api/forex", tags=["Forex"])

class TradeRequest(BaseModel):
    symbol: str
    action: Literal["buy", "sell"]
    quantity: int
    price: float

@router.get("/price")
async def price(symbol: str = Query(..., min_length=1)):
    return await get_current_forex_price(symbol)

@router.get("/market-status")
async def market_status():
    return await get_forex_market_status()

# add params similar to crypto
@router.get("/history")
async def get_history(
    symbol: str = Query(..., description="Forex symbol, e.g. EUR, JPY"),
    resolution: str = Query("D", description="Resolution: 1, 5, 15, 30, 60, 240, D, DY, W, M"),
    start: Optional[int] = Query(None, description="Unix seconds"),
    end:   Optional[int] = Query(None, description="Unix seconds"),
    limit: int = Query(500, ge=1, le=2000),
):
    # Map to yfinance intervals we support
    resolution_map = {
        "1": "1m",
        "5": "5m",
        "15": "15m",
        "30": "30m",
        "60": "60m",
        "240": "4h",
        "D": "1d",
        "DY": "1d_ytd",   # daily since Jan 1
        "W": "1wk",
        "M": "1mo",
    }
    fx_resolution = resolution_map.get(resolution.upper())
    if fx_resolution is None:
        raise HTTPException(status_code=400, detail=f"Unsupported resolution: {resolution}")

    data = await get_forex_history(symbol.upper(), fx_resolution, start_ts=start, end_ts=end, limit=limit)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])
    return data


    
@router.get("/balance")
async def get_forex_balance(user_data=Depends(firebase_user)):
    try:
        uid = user_data["uid"]
        balance = await get_user_forex_balance(uid)
        return {"balance": balance}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
    
@router.post("/order")
async def submit_order(
    trade: TradeRequest,
    user_data=Depends(firebase_user)
):
    user_id = user_data["uid"]

    result = await forex_trade(
        symbol=trade.symbol,
        action=trade.action,
        quantity=trade.quantity,
        price=trade.price,
        user_id=user_id
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result