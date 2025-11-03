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

def _to_seconds(ts: int | None) -> int | None:
    """
    Accept ms or seconds from callers and normalize to seconds.
    """
    if ts is None:
        return None
    ts = int(ts)
    return ts // 1000 if ts >= 10**12 else ts

def _candle_ts_s(c: dict) -> int:
    """
    Robustly read a candle's timestamp as seconds (handles str/float/ms).
    """
    ts = c.get("timestamp", 0)
    try:
        ts = int(float(ts))
    except Exception:
        ts = 0
    return ts // 1000 if ts >= 10**12 else ts

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

async def get_forex_history(
    base: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    """
    Fetch FX candles from Yahoo via yfinance.

    Intraday:  1m,5m,15m,30m,60m,120m(=2h),240m(=4h)
    Higher TF: 1d, 1wk   (monthly if you want: 1mo)
    """
    try:
        import yfinance as yf
        import math

        base = (base or "").strip().upper()
        if len(base) != 3:
            return {"error": f"Invalid base currency: {base}"}

        # Normalize res aliases to internal and then to Yahoo params
        key = _normalize_resolution_to_internal(resolution)
        ticker = yf.Ticker(f"{base}USD=X")

        # Period windows that satisfy Yahoo limits for intraday
        PERIOD_FOR = {
            "1":   "7d",
            "5":   "7d",
            "15":  "60d",
            "30":  "60d",
            "60":  "730d",  # ~2 years
        }

        # Accept ms or s, and build an inclusive start / exclusive end window
        s = _to_seconds(start_ts) if start_ts is not None else None
        e = _to_seconds(end_ts)   if end_ts   is not None else None
        if s is not None and e is not None and e <= s:
            e = s + 1

        # Decide Yahoo interval from internal key
        if key in {"1","5","15","30","60"}:
            interval = f"{key}m"
            period   = PERIOD_FOR[key]

            def load():
                # Intraday must use 'period'
                return ticker.history(period=period, interval=interval)

            df = await asyncio.to_thread(load)

            # Synthetic 120m / 240m can be resampled from 60m path if requested upstream,
            # but here we only serve native minute keys; resampling handled below if needed.

        elif key in {"120","240"}:
            # Always fetch 60m and resample to 2H/4H
            def load():
                return ticker.history(period=PERIOD_FOR["60"], interval="60m")
            df = await asyncio.to_thread(load)

        elif key in {"D","W","M"}:
            interval = {"D": "1d", "W": "1wk", "M": "1mo"}[key]
            # For daily/weekly/monthly, use start/end if both provided; else use period
            default_period = {"D": "5y", "W": "10y", "M": "10y"}[key]

            def load():
                if s is not None and e is not None:
                    return ticker.history(
                        start=datetime.utcfromtimestamp(int(s)),
                        end=datetime.utcfromtimestamp(int(e)),
                        interval=interval,
                    )
                return ticker.history(period=default_period, interval=interval)

            df = await asyncio.to_thread(load)

        else:
            return {"error": f"Unsupported resolution: {resolution} (normalized='{key}')"}

        if df is None or df.empty:
            return {"symbol": f"{base}/USD", "resolution": key, "history": []}

        # If we fetched 60m for resampling (120/240), do it here
        if key in {"120","240"} and (df is not None and not df.empty):
            rule = "2H" if key == "120" else "4H"
            df = df.resample(rule).agg({
                "Open":  "first",
                "High":  "max",
                "Low":   "min",
                "Close": "last",
                "Volume":"sum",
            }).dropna()

        # Sort and convert to rows with UTC epoch seconds
        df = df.sort_index()

        rows: list[dict[str, float | int]] = []
        for idx, row in df.iterrows():
            # robust UTC epoch
            ts = int(idx.timestamp()) if getattr(idx, "tzinfo", None) else int(
                datetime(idx.year, idx.month, idx.day,
                         getattr(idx, "hour", 0),
                         getattr(idx, "minute", 0),
                         getattr(idx, "second", 0),
                         tzinfo=dt_tz.utc).timestamp()
            )

            # Apply time window with EXCLUSIVE end if provided
            if s is not None and ts < s:
                continue
            if e is not None and not (ts < e):
                continue

            vol_raw = row.get("Volume", 0)
            if isinstance(vol_raw, float) and math.isnan(vol_raw):
                vol = 0
            else:
                try:
                    vol = int(vol_raw or 0)
                except Exception:
                    vol = 0

            rows.append({
                "timestamp": ts,
                "open":  float(row["Open"]),
                "high":  float(row["High"]),
                "low":   float(row["Low"]),
                "close": float(row["Close"]),
                "volume": vol,
            })

        # Enforce limit (keep most recent N, preserve order)
        if limit and len(rows) > limit:
            rows = rows[-limit:]

        return {
            "symbol": f"{base}/USD",
            "resolution": key,     # return normalized key to match DB
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
        
        market_status = await get_forex_market_status()

        if not market_status["isOpen"]:
            return {"error": "Forex trades can only be made while the markets are open."}
        
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
    r = (res or "").strip().lower()
    # Minutes
    if r in {"1","1m","m1"}: return "1"
    if r in {"5","5m","m5"}: return "5"
    if r in {"15","15m","m15"}: return "15"
    if r in {"30","30m","m30"}: return "30"
    if r in {"60","60m","m60","1h","h1"}: return "60"
    # Hours
    if r in {"120","120m","m120","2h","h2"}: return "120"
    if r in {"240","240m","m240","4h","h4"}: return "240"
    # Higher TF
    if r in {"d","1d","day"}: return "D"
    if r in {"w","1w","wk","1wk","week"}: return "W"
    if r in {"m","1mo","mo","month","1month"}: return "M"
    # Fallbacks / legacy
    if r == "dy": return "D"
    return r.upper() if r else "D"

async def get_forex_history_db(
    base: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    key  = _normalize_resolution_to_internal(resolution)
    base = (base or "").strip().upper()

    def fetch():
        return forex_histories_collection.find_one({"symbol": base})

    doc = await asyncio.to_thread(fetch)
    if not doc or "histories" not in doc or key not in doc["histories"]:
        return {"symbol": base, "resolution": key, "history": []}

    candles = doc["histories"].get(key, []) or []

    # Ensure ASC
    if candles:
        candles = sorted(candles, key=_candle_ts_s)

    # Apply inclusive start / EXCLUSIVE end window (accept ms or s)
    if start_ts is not None or end_ts is not None:
        s = _to_seconds(start_ts) if start_ts is not None else -10**15
        e = _to_seconds(end_ts)   if end_ts   is not None else  10**15
        if e <= s:
            e = s + 1
        candles = [c for c in candles if s <= _candle_ts_s(c) < e]

    # Apply limit (most recent N), keep ASC
    if limit and len(candles) > limit:
        candles = candles[-limit:]

    return {"symbol": base, "resolution": key, "history": candles}
