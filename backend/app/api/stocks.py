from fastapi import APIRouter, Query
from app.services.stock_prices import get_current_price

router = APIRouter(prefix="/api", tags=["Stocks"])

@router.get("/price")
async def price(symbol: str = Query(..., min_length=1)):
    return await get_current_price(symbol)
