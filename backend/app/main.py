from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import stock_routes
from app.api.routes import user_routes
from app.api.routes import crypto_routes
from app.firebase.firebase_setup import *

from app.services.stock_updater import run_stock_price_loop
from app.services.crypto_updater import run_crypto_price_loop
import threading
from contextlib import asynccontextmanager
from app.core.symbols import CRYPTO_SYMBOLS

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Stock updater
    stock_stop = threading.Event()
    stock_thread = threading.Thread(target=run_stock_price_loop, args=(stock_stop,), daemon=True)
    stock_thread.start()
    print("✅ Background stock price updater started.")

    # Crypto updater
    crypto_stop = threading.Event()
    crypto_thread = threading.Thread(
        target=run_crypto_price_loop,
        args=(crypto_stop, CRYPTO_SYMBOLS, 15),
        daemon=True,
    )
    crypto_thread.start()
    print("✅ Background crypto price updater started.")

    try:
        yield
    finally:
        print("🛑 Shutting down background updaters...")
        stock_stop.set()
        crypto_stop.set()
        stock_thread.join()
        crypto_thread.join()
        print("✅ All background updaters stopped.")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stock_routes.router)
app.include_router(user_routes.router)
app.include_router(crypto_routes.router)


@app.get("/api/ping")
def ping():
    return {"message": "pong"}
