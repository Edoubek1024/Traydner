import httpx
from app.core.config import FINNHUB_API_KEY

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
