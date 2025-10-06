import re, time
from bs4 import BeautifulSoup
from app.db.mongo import forex_prices_collection, users_collection, trades_collection, forex_histories_collection
import asyncio
import traceback
from datetime import datetime, time as dt_time, timezone as dt_tz
from pytz import timezone
import requests
import math

NUMERIC_RE = re.compile(r"\d")
starting_now = time.time()

URL = "https://finance.yahoo.com/markets/currencies/"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0.0.0 Safari/537.36"),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def _extract_price_from_td(td):
    try:
        fs = td.select_one("fin-streamer")
        candidates = []
        if fs:
            for attr in ("value", "data-value", "data-price"):
                v = fs.get(attr)
                if v:
                    candidates.append(v)
            txt = fs.get_text(strip=True)
            if txt:
                candidates.append(txt)
        raw = td.get_text(strip=True)
        if raw:
            candidates.append(raw)

        for c in candidates:
            try:
                val = float(
                    c.replace("\u2212", "-")  # unicode minus
                     .replace("\u2009", "")   # thin space
                     .replace("\xa0", "")     # nbsp
                     .replace(",", "")
                     .strip()
                )
                if math.isfinite(val):
                    return val
            except Exception:
                continue
        return None
    except Exception as e:
        print(f"⚠️ price extract error: {e}")
        return None

def scrape_yahoo_currencies_html(url: str = URL) -> dict[str, float]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        print(f"⚠️ request failed: {e}")
        return {}

    try:
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        print(f"⚠️ parse failed: {e}")
        return {}

    raw: dict[str, float] = {}
    try:
        for row in soup.select("table tbody tr"):
            try:
                a = row.select_one('td[data-testid-cell="ticker"] a')
                if not a:
                    continue
                sym = (a.get_text() or "").strip().upper()
                if not sym.endswith("=X"):
                    continue

                price_td = row.select_one('td[data-testid-cell="intradayprice"]')
                if not price_td:
                    continue

                px = _extract_price_from_td(price_td)
                if px is None or not math.isfinite(px):
                    continue
                raw[sym] = float(px)
            except Exception as e_row:
                print(f"⚠️ row skipped due to error: {e_row}")
                continue
    except Exception as e:
        print(f"⚠️ table walk failed: {e}")
        return {}

    # Convert to USD-based mapping: {NONUSD: USD per 1 unit}
    usd_map: dict[str, float] = {}
    try:
        for sym, px in raw.items():
            core = sym[:-2]  # strip '=X'
            if len(core) == 6:
                base, quote = core[:3], core[3:6]
                if quote == "USD":
                    usd_map[base] = px
                elif base == "USD" and px:
                    try:
                        inv = 1.0 / px
                        if math.isfinite(inv):
                            usd_map[quote] = inv
                    except Exception:
                        continue
            elif len(core) == 3:  # e.g., JPY=X implies USD/JPY
                if px:
                    try:
                        inv = 1.0 / px
                        if math.isfinite(inv):
                            usd_map[core] = inv
                    except Exception:
                        continue
            # ignore non-USD crosses/others
    except Exception as e:
        print(f"⚠️ conversion failed: {e}")
        return {}

    return usd_map

async def get_forex_market_status() -> dict:
    eastern = timezone("US/Eastern")
    now = datetime.now(eastern)

    weekday = now.weekday()  # Monday=0, Sunday=6
    current_time = now.time()

    if weekday == 6:
        is_open = current_time >= dt_time(19, 0)
    elif weekday in range(0, 4):
        is_open = True
    elif weekday == 4:
        is_open = current_time < dt_time(17, 30)
    else:
        is_open = False

    return {
        "isOpen": is_open,
        "time": now.isoformat(),
        "weekday": weekday,
        "currentTime": current_time.strftime("%H:%M:%S"),
    }

def get_usd_based_forex():
    usd_map = scrape_yahoo_currencies_html("https://finance.yahoo.com/markets/currencies/")
    return usd_map

async def get_current_forex_price(symbol: str) -> dict:
    def fetch():
        return forex_prices_collection.find_one({"symbol": symbol.upper()})
    
    doc = await asyncio.to_thread(fetch)

    if doc and "price" in doc:
        return {
            "symbol": symbol.upper(),
            "price": doc["price"],
            "updatedAt": doc.get("updatedAt")
        }
    else:
        return {
            "symbol": symbol.upper(),
            "error": "Price not found in database"
        }
    
# forex_service.py
# forex_service.py
import asyncio
import traceback
from datetime import datetime, timezone as dt_tz

async def get_forex_history(
    base: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    """
    Fetch FX candles from Yahoo via yfinance.

    Supported resolution tokens (case-insensitive):
      Intraday:  "1m","5m","15m","30m","60m","120m","240m","4h"
        - 30m will fallback to 15m (or 5m) and be resampled → 30m if native is empty
        - 120m/240m are resampled from 60m
      Higher TF: "1d","1d_ytd","1wk"
    """
    try:
        import yfinance as yf

        base = base.strip().upper()
        if len(base) != 3:
            return {"error": f"Invalid base currency: {base}"}

        ticker = yf.Ticker(f"{base}USD=X")

        # Normalize resolution
        res = resolution.lower()
        if res == "4h":
            res = "240m"

        # Period windows that satisfy Yahoo limits for intraday
        PERIOD_FOR = {
            "1m":  "7d",
            "5m":  "7d",
            "15m": "60d",
            "30m": "60d",
            "60m": "730d",   # ~2 years
        }

        def load_with(period: str | None, interval: str):
            # Intraday: must use period query
            if interval.endswith("m"):
                return ticker.history(period=period, interval=interval)
            # Daily/weekly: use explicit window if provided, else period
            if start_ts and end_ts:
                return ticker.history(
                    start=datetime.fromtimestamp(start_ts, tz=dt_tz.utc),
                    end=datetime.fromtimestamp(end_ts, tz=dt_tz.utc),
                    interval=interval,
                )
            return ticker.history(period=period or "1y", interval=interval)

        # ---------- Load DataFrame according to requested res ----------
        df = None
        if res in {"1m","5m","15m","30m","60m"}:
            # Try native first
            period = PERIOD_FOR[res]
            df = await asyncio.to_thread(load_with, period, res)
            # Special fallback: 30m → 15m → 5m (then resample to 30m)
            if res == "30m" and (df is None or df.empty):
                for fallback in ("15m", "5m"):
                    fb_period = PERIOD_FOR[fallback]
                    df_fb = await asyncio.to_thread(load_with, fb_period, fallback)
                    if df_fb is not None and not df_fb.empty:
                        df = df_fb
                        res = "30m_from_" + fallback  # mark to resample below
                        break

        elif res in {"120m","240m"}:
            # Always fetch 60m and resample to 2H/4H
            df = await asyncio.to_thread(load_with, PERIOD_FOR["60m"], "60m")

        elif res in {"1d","1d_ytd","1wk"}:
            period = {"1d": "5y", "1d_ytd": "ytd", "1wk": "10y"}[res]
            interval = {"1d": "1d", "1d_ytd": "1d", "1wk": "1wk"}[res]
            df = await asyncio.to_thread(load_with, period, interval)

        else:
            return {"error": f"Unsupported resolution: {resolution}"}

        # ---------- Resampling for synthetic intervals ----------
        if df is not None and not df.empty:
            # 30m fallback resampling
            if isinstance(res, str) and res.startswith("30m_from_"):
                rule = "30T"  # 30 minutes
                df = df.resample(rule).agg({
                    "Open":  "first",
                    "High":  "max",
                    "Low":   "min",
                    "Close": "last",
                    "Volume":"sum",
                }).dropna()

            # 120m / 240m from 60m
            elif resolution.lower() in {"120m","240m","4h"}:
                rule = "2H" if resolution.lower() == "120m" else "4H"
                df = df.resample(rule).agg({
                    "Open":  "first",
                    "High":  "max",
                    "Low":   "min",
                    "Close": "last",
                    "Volume":"sum",
                }).dropna()

        # ---------- Convert to rows ----------
        rows = []
        if df is not None and not df.empty:
            df = df.sort_index()
            # If caller passed start/end (rare for intraday), filter after resample too
            lo = start_ts if start_ts is not None else -10**15
            hi = end_ts   if end_ts   is not None else  10**15
            for idx, row in df.iterrows():
                ts = int(idx.timestamp()) if getattr(idx, "tzinfo", None) else int(
                    datetime(idx.year, idx.month, idx.day,
                             getattr(idx, "hour", 0),
                             getattr(idx, "minute", 0),
                             getattr(idx, "second", 0),
                             tzinfo=dt_tz.utc).timestamp()
                )
                if lo <= ts <= hi:
                    rows.append({
                        "timestamp": ts,
                        "open":  float(row["Open"]),
                        "high":  float(row["High"]),
                        "low":   float(row["Low"]),
                        "close": float(row["Close"]),
                        "volume": int(row.get("Volume", 0) or 0),
                    })

        if limit and len(rows) > limit:
            rows = rows[-limit:]

        return {
            "symbol": f"{base}/USD",
            "resolution": resolution,
            "history": rows
        }

    except Exception as e:
        return {"error": str(e), "trace": traceback.format_exc()}

    
async def get_user_forex_balance(uid: str) -> dict:
    user = await asyncio.to_thread(users_collection.find_one, {"uid": uid})
    if not user:
        raise ValueError("User not found")

    balance = user.get("balance", {"cash": 0, "forex": {}})
    return balance

async def forex_trade(symbol: str, action: str, quantity: int, price: float, user_id: str) -> dict:
    try:
        if action not in {"buy", "sell"}:
            return {"error": "Invalid trade action. Must be 'buy' or 'sell'."}
        if quantity <= 0 or price <= 0:
            return {"error": "Quantity and price must be greater than zero."}
        
        total_cost = quantity * price

        user = await asyncio.to_thread(users_collection.find_one, {"uid": user_id})
        if not user:
            return {"error": "User not found."}

        balance = user.get("balance", {"cash": 0, "forex": {}})

        if action == "buy":
            if balance["cash"] < total_cost:
                return {"error": "Insufficient cash balance."}

            balance["cash"] -= total_cost
            balance["forex"][symbol] = balance["forex"].get(symbol, 0) + quantity

        elif action == "sell":
            current_quantity = balance["forex"].get(symbol, 0)
            if current_quantity < quantity:
                return {"error": "Insufficient shares to sell."}

            balance["forex"][symbol] = current_quantity - quantity
            balance["cash"] += total_cost

            if balance["forex"][symbol] == 0:
                del balance["forex"][symbol]

        await asyncio.to_thread(users_collection.update_one,
            {"uid": user_id},
            {"$set": {"balance": balance}}
        )

        trade_doc = {
            "userId": user_id,
            "symbol": symbol.upper(),
            "action": action,
            "quantity": quantity,
            "price": price,
            "total": total_cost,
            "timestamp": time.time()
        }
        result = await asyncio.to_thread(trades_collection.insert_one, trade_doc)
        trade_doc["_id"] = str(result.inserted_id)

        return {"status": "success", "trade": trade_doc, "balance": balance}

    except Exception as e:
        print("❌ Backend trade error:", e)
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}
    
_INTERNAL_KEYS = {"1","5","15","30","60","120","240","D","W","M"}

def _normalize_resolution_to_internal(res: str) -> str:
    r = res.upper()
    if r in _INTERNAL_KEYS:
        return r
    if r in {"DY"}: 
        return "D"
    return {
        "1M":"1","5M":"5","15M":"15","30M":"30","60M":"60",
        "1D":"D","1WK":"W","1MO":"M"
    }.get(r, "D")

async def get_forex_history_db(
    base: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    key = _normalize_resolution_to_internal(resolution)
    base = base.strip().upper()

    def fetch():
        return forex_histories_collection.find_one({"symbol": base})

    doc = await asyncio.to_thread(fetch)
    if not doc or "histories" not in doc or key not in doc["histories"]:
        return {"symbol": f"{base}", "resolution": key, "history": []}

    candles = doc["histories"].get(key, [])
    # optional range trimming
    if start_ts is not None or end_ts is not None:
        st = start_ts if start_ts is not None else -10**15
        en = end_ts   if end_ts   is not None else  10**15
        candles = [c for c in candles if st <= int(c["timestamp"]) <= en]

    if limit and len(candles) > limit:
        candles = candles[-limit:]

    return {"symbol": base, "resolution": key, "history": candles}