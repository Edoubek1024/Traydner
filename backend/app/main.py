from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.api import stocks
from app.api.Users import user_routes
from firebase.firebase_setup import *

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router)
app.include_router(user_routes.router)


@app.get("/api/ping")
def ping():
    return {"message": "pong"}
