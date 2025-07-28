from fastapi import APIRouter, Query, HTTPException
from app.services.stock_prices import get_current_price, get_stock_history

router = APIRouter(prefix="/api", tags=["Stocks"])

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