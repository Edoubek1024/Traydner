from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from app.services.stock_service import stock_trade
from app.firebase.firebase_auth import firebase_user
from pydantic import BaseModel
from app.services.stock_service import get_current_price, get_stock_history
from typing import Literal

router = APIRouter(prefix="/api", tags=["Stocks"])

class TradeRequest(BaseModel):
    symbol: str
    action: Literal["buy", "sell"]
    quantity: int
    price: float

@router.get("/price")
async def price(symbol: str = Query(..., min_length=1)):
    return await get_current_price(symbol)

@router.get("/history")
async def get_history(
    symbol: str = Query(..., description="Stock symbol, e.g. AAPL, TSLA"),
    resolution: str = Query("D", description="Resolution: 1, 5, 15, 30, 60, D, W, M")
):
    resolution_map = {
        "1": "1m",
        "5": "5m",
        "15": "15m",
        "30": "30m",
        "60": "60m",
        "D": "1d",
        "W": "1wk",
        "M": "1mo"
    }

    yf_resolution = resolution_map.get(resolution.upper())
    if yf_resolution is None:
        raise HTTPException(status_code=400, detail=f"Unsupported resolution: {resolution}")

    try:
        data = await get_stock_history(symbol.upper(), yf_resolution)
        if "error" in data:
            raise HTTPException(status_code=500, detail=data["error"])
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/trades/order")
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