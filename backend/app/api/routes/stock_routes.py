from fastapi import APIRouter, Query, HTTPException, Depends
from app.services.stock_service import stock_trade
from app.firebase.firebase_auth import firebase_user
from pydantic import BaseModel
from app.services.stock_service import get_current_price, get_stock_history, is_market_open, get_user_balance, get_stock_history_db
from typing import Literal, Optional

router = APIRouter(prefix="/api/stocks", tags=["Stocks"])

class TradeRequest(BaseModel):
    symbol: str
    action: Literal["buy", "sell"]
    quantity: int
    price: float

@router.get("/market-status")
async def market_status():
    return await is_market_open()

@router.get("/price")
async def price(symbol: str = Query(..., min_length=1)):
    return await get_current_price(symbol)

@router.get("/history")
async def get_history(
    symbol: str = Query(..., description="Stock symbol, e.g. AAPL, TSLA"),
    resolution: str = Query("D", description="Resolution: 1, 5, 15, 30, 60, D, W, M"),
    start: Optional[int] = Query(None, description="unix seconds"),
    end:   Optional[int] = Query(None, description="unix seconds"),
    limit: int = Query(500, ge=1, le=2000),
):
    resolution_map = {"1":"1m","5":"5m","15":"15m","30":"30m","60":"60m","D":"1d","W":"1wk","M":"1mo"}
    yf_resolution = resolution_map.get(resolution.upper())
    if yf_resolution is None:
        raise HTTPException(status_code=400, detail=f"Unsupported resolution: {resolution}")

    data = await get_stock_history(symbol.upper(), yf_resolution, start_ts=start, end_ts=end, limit=limit)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])
    return data
    
@router.post("/order")
async def submit_order(
    trade: TradeRequest,
    user_data=Depends(firebase_user)
):
    user_id = user_data["uid"]

    result = await stock_trade(
        symbol=trade.symbol,
        action=trade.action,
        quantity=trade.quantity,
        price=trade.price,
        user_id=user_id
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/balance")
async def get_stock_balance(user_data=Depends(firebase_user)):
    try:
        uid = user_data["uid"]
        balance = await get_user_balance(uid)
        return {"balance": balance}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
    
@router.get("/history/db")
async def stocks_history_db(
    symbol: str,
    resolution: str,
    start: Optional[int] = Query(None, description="UTC seconds (inclusive)"),
    end: Optional[int]   = Query(None, description="UTC seconds (exclusive)"),
    limit: Optional[int] = Query(500, ge=1, le=5000),
):
    data = await get_stock_history_db(symbol, resolution, start_ts=start, end_ts=end, limit=limit or 500)
    return data