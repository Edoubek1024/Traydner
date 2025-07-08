from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/ping")
def ping():
    return {"message": "pong"}

FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

@app.get("/api/price")
async def get_price(symbol: str = Query(..., min_length=1)):
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={FINNHUB_API_KEY}"
        )
        data = res.json()
        return {"symbol": symbol.upper(), "price": data["c"]}