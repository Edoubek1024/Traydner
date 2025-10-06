from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]

users_collection = db["users"]
trades_collection = db["trades"]
stock_prices_collection = db["stock_prices"]
crypto_prices_collection = db["crypto_prices"]
forex_prices_collection = db["forex_prices"]
stock_histories_collection = db["stock_histories"]
crypto_histories_collection = db["crypto_histories"]
forex_histories_collection = db["forex_histories"]