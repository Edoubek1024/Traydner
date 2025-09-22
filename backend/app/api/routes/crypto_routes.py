from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel
from typing import Literal
import httpx
from app.services.crypto_service import get_user_crypto_balance, get_crypto_price_db, crypto_trade, get_crypto_history

from app.firebase.firebase_auth import firebase_user

router = APIRouter(prefix="/api/crypto", tags=["Crypto"])

class CryptoTradeRequest(BaseModel):
    symbol: str
    action: Literal["buy", "sell"]
    quantity: float
    price: float

@router.get("/balance")
async def get_crypto_balance(user_data=Depends(firebase_user)):
    try:
        uid = user_data["uid"]
        balance = await get_user_crypto_balance(uid)
        return {"balance": balance}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
    
@router.get("/price")
async def get_crypto_price(symbol: str = Query(..., min_length=1)):
    try:
        price = await get_crypto_price_db(symbol)
        return {"symbol": symbol.upper(), "price": price}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
    
@router.get("/history")
async def crypto_history(
    symbol: str = Query(..., description="Crypto symbol, e.g. BTC, ETH"),
    resolution: str = Query("D", description="1,5,15,30,60,120,240,D,W,M"),
    start: int | None = Query(None, description="Start time (unix seconds)"),
    end: int | None = Query(None, description="End time (unix seconds)"),
    limit: int = Query(500, ge=1, le=1000),
):
    try:
        data = await get_crypto_history(symbol.upper(), resolution, start_ts=start, end_ts=end, limit=limit)
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"])
        return data
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {e.response.text}")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
    
@router.post("/order")
async def submit_crypto_order(
    trade: CryptoTradeRequest,
    user_data = Depends(firebase_user),
):
    user_id = user_data["uid"]

    result = await crypto_trade(
        symbol=trade.symbol,
        action=trade.action,
        quantity=trade.quantity,
        price=trade.price,
        user_id=user_id,
    )

    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result