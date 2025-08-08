from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import stock_routes
from app.api.routes import user_routes
from app.firebase.firebase_setup import *

from app.services.stock_updater import run_price_loop
import threading
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = threading.Event()
    thread = threading.Thread(target=run_price_loop, args=(stop_event,), daemon=True)
    thread.start()

    print("✅ Background price updater started.")

    try:
        yield
    finally:
        print("🛑 Shutting down background price updater...")
        stop_event.set()
        thread.join()
        print("✅ Background price updater stopped.")


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


@app.get("/api/ping")
def ping():
    return {"message": "pong"}
