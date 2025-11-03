from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import contextlib
import threading
import asyncio

from app.api.routes import (
    stock_routes, user_routes, crypto_routes, forex_routes, api_key_routes, remote_routes
)
from app.firebase.firebase_setup import init_firebase

from app.core.symbols import CRYPTO_SYMBOLS, STOCK_SYMBOLS, FOREX_SYMBOLS

# Price loops (all thread-based)
from app.services.stock_updater import run_stock_price_loop
from app.services.forex_updater import run_forex_price_loop
from app.services.crypto_updater import run_crypto_price_loop  # <-- use sync/threaded version

# History loops (async tasks)
from app.services.stock_updater import run_stock_history_loop
from app.services.crypto_updater import run_crypto_history_loop
from app.services.forex_updater import run_forex_history_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ----- one-time init -----
    init_firebase()

    stock_stop = threading.Event()
    stock_thread = threading.Thread(
        target=run_stock_price_loop,
        args=(stock_stop, STOCK_SYMBOLS, 20),   # <-- 5 sec interval = several times/min
        daemon=True,
    )
    stock_thread.start()
    print("✅ Background stock price updater (threaded) started.")

    crypto_stop = threading.Event()
    crypto_thread = threading.Thread(
        target=run_crypto_price_loop, args=(crypto_stop, CRYPTO_SYMBOLS, 20), daemon=True
    )
    crypto_thread.start()
    print("✅ Background crypto price updater started (thread).")

    forex_stop = threading.Event()
    forex_thread = threading.Thread(
        target=run_forex_price_loop, args=(forex_stop, 30), daemon=True
    )
    forex_thread.start()
    print("✅ Background forex price updater started.")

    # ----- start async history tasks (same event loop) -----
    loop = asyncio.get_running_loop()
    stock_hist_task = loop.create_task(run_stock_history_loop(STOCK_SYMBOLS))
    crypto_hist_task = loop.create_task(run_crypto_history_loop(CRYPTO_SYMBOLS, max_concurrency=8))
    forex_hist_task = loop.create_task(run_forex_history_loop(FOREX_SYMBOLS))
    print("✅ Background history updaters started.")

    try:
        yield
    finally:
        print("🛑 Shutting down background updaters...")

        # Stop thread-based price loops
        stock_stop.set()
        crypto_stop.set()
        forex_stop.set()
        stock_thread.join(timeout=5)
        crypto_thread.join(timeout=5)
        forex_thread.join(timeout=5)

        # Stop history tasks
        for t in (stock_hist_task, crypto_hist_task, forex_hist_task):
            t.cancel()
        for t in (stock_hist_task, crypto_hist_task, forex_hist_task):
            with contextlib.suppress(asyncio.CancelledError):
                await t

        print("✅ All background updaters stopped.")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://www.traydner.com",
        "https://traydner.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(stock_routes.router)
app.include_router(user_routes.router)
app.include_router(crypto_routes.router)
app.include_router(forex_routes.router)
app.include_router(api_key_routes.router)
app.include_router(remote_routes.router)


@app.get("/api/ping")
def ping():
    return {"message": "pong"}
