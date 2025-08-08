import asyncio
import time
import httpx
import os

from app.db.mongo import stock_prices_collection
from app.core.symbols import STOCK_SYMBOLS
from app.core.config import FINNHUB_API_KEYS

def get_api_key(i):
  return FINNHUB_API_KEYS[i % len(FINNHUB_API_KEYS)]

async def fetch_prices():
  async with httpx.AsyncClient() as client:
    results = []
    for i, symbol in enumerate(STOCK_SYMBOLS):
      api_key = get_api_key(i)
      url = f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={api_key}"
      result = await fetch_finnhub_price(symbol, client, url)
      results.append(result)
      await asyncio.sleep(0.3)
    return results

async def fetch_finnhub_price(symbol: str, client: httpx.AsyncClient, url: str) -> dict:
  try:
    res = await client.get(url)
    res.raise_for_status()
    data = res.json()
    if "c" not in data or data["c"] == 0:
      return {"symbol": symbol.upper(), "error": "Invalid or zero price received", "data": data}
    return {"symbol": symbol.upper(), "price": data["c"]}
  except Exception as e:
    return {
      "symbol": symbol.upper(),
      "error": str(e),
      "status_code": res.status_code if res else None,
      "body": res.text if res else None,
    }


def update_prices_to_mongo():
  loop = asyncio.new_event_loop()
  asyncio.set_event_loop(loop)
  results = loop.run_until_complete(fetch_prices())
  loop.close()

  for result in results:
    if "price" in result:
      stock_prices_collection.update_one(
        {"symbol": result["symbol"]},
        {
          "$set": {
            "price": result["price"],
            "updatedAt": time.time()
          }
        },
        upsert=True
      )
    else:
      print(f"❌ Failed to fetch price for {result.get('symbol')}: {result.get('error')}")


def run_price_loop(stop_event):
  while not stop_event.is_set():
    update_prices_to_mongo()
    print(f"✅ Updated prices at {time.strftime('%Y-%m-%d %H:%M:%S')}")