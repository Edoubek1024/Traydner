from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import threading
import asyncio

from app.api.routes import (
    stock_routes, user_routes, crypto_routes, forex_routes, api_key_routes, remote_routes
)
from app.firebase.firebase_setup import init_firebase

from app.core.symbols import CRYPTO_SYMBOLS, STOCK_SYMBOLS, FOREX_SYMBOLS

# Price loops (thread-based, sync I/O inside)
from app.services.stock_updater import run_stock_price_loop
from app.services.forex_updater import run_forex_price_loop
from app.services.crypto_updater import run_crypto_price_loop

# History loops (async, infinite loops) — we'll run each in its own thread+event loop
from app.services.stock_updater import run_stock_history_loop
from app.services.crypto_updater import run_crypto_history_loop
from app.services.forex_updater import run_forex_history_loop


# --------------------------
# Helpers
# --------------------------
def _start_thread(name: str, target, *args, daemon: bool = True) -> threading.Thread:
    th = threading.Thread(target=target, args=args, name=name, daemon=daemon)
    th.start()
    return th

def _start_async_worker_thread(name: str, coro_fn, *args) -> threading.Thread:
    def _runner():
        try:
            asyncio.run(coro_fn(*args))
        except asyncio.CancelledError:
            # Normal shutdown path
            pass
        except Exception as e:
            print(f"❌ {name} crashed: {e}")

    return _start_thread(name, _runner)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ----- one-time init -----
    init_firebase()

    # --------------------------
    # Price updater threads
    # --------------------------
    stock_stop = threading.Event()
    stock_thread = _start_thread(
        "stock-price-loop",
        run_stock_price_loop,
        stock_stop,
        STOCK_SYMBOLS,
        20,  # seconds; keep under a minute so we get multiple passes/min
        daemon=True,
    )
    print("✅ Background stock price updater (threaded) started.")

    crypto_stop = threading.Event()
    crypto_thread = _start_thread(
        "crypto-price-loop",
        run_crypto_price_loop,
        crypto_stop,
        CRYPTO_SYMBOLS,
        20,
    )
    print("✅ Background crypto price updater started (thread).")

    forex_stop = threading.Event()
    forex_thread = _start_thread(
        "forex-price-loop",
        run_forex_price_loop,
        forex_stop,
        30,
    )
    print("✅ Background forex price updater started (thread).")

    # --------------------------
    # History updater async workers (each on its own loop/thread)
    # --------------------------
    stock_hist_thread  = _start_async_worker_thread("stock-history-loop",  run_stock_history_loop,  STOCK_SYMBOLS)
    crypto_hist_thread = _start_async_worker_thread("crypto-history-loop", run_crypto_history_loop, CRYPTO_SYMBOLS, )
    # keep your chosen max_concurrency inside the service function if needed
    forex_hist_thread  = _start_async_worker_thread("forex-history-loop",  run_forex_history_loop,  FOREX_SYMBOLS)

    print("✅ Background history updaters started (each on its own event loop).")

    try:
        yield
    finally:
        print("🛑 Shutting down background updaters...")

        # Request stop for thread-based price loops
        stock_stop.set()
        crypto_stop.set()
        forex_stop.set()

        # Join price threads (don’t block shutdown forever)
        for th in (stock_thread, crypto_thread, forex_thread):
            th.join(timeout=5)

        # We can't cancel threads directly; the async workers run until process exits.
        # Join briefly so logs show orderly shutdown.
        for th in (stock_hist_thread, crypto_hist_thread, forex_hist_thread):
            th.join(timeout=2)

        print("✅ All background updaters signaled to stop.")


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

@app.get("/healthz")
def healthz():
    return {"ok": True}
