import httpx
from app.core.config import FINNHUB_API_KEY
import time
import traceback
import yfinance as yf

async def get_current_price(symbol: str) -> dict:
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={FINNHUB_API_KEY}"
        )
        data = res.json()
        return {
            "symbol": symbol.upper(),
            "price": data["c"]
        }

async def get_stock_history(symbol: str, resolution: str) -> dict:
    try:
        ticker = yf.Ticker(symbol)

        resolution_map = {
            "1d": ("5y", "1d"),
            "1wk": ("5y", "1wk"),
            "1mo": ("5y", "1mo"),
            "60m": ("730d", "60m"),
        }

        if resolution not in resolution_map:
            return {"error": f"Unsupported resolution: {resolution}"}

        period, interval = resolution_map[resolution]
        df = ticker.history(period=period, interval=interval)

        history = [
            {
                "timestamp": int(time.mktime(idx.timetuple())),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"])
            }
            for idx, row in df.iterrows()
        ]

        return {
            "symbol": symbol.upper(),
            "resolution": resolution,
            "history": history
        }

    except Exception as e:
        return {
            "error": str(e),
            "trace": traceback.format_exc()
        }