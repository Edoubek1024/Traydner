import os
from dotenv import load_dotenv

load_dotenv()

FINNHUB_API_KEYS = [
  os.getenv("FINNHUB_API_KEY"),
  os.getenv("FINNHUB_API_KEY_TWO"),
  os.getenv("FINNHUB_API_KEY_THREE"),
  os.getenv("FINNHUB_API_KEY_FOUR"),
  os.getenv("FINNHUB_API_KEY_FIVE")
]