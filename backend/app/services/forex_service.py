import re, time
import os, sys, subprocess
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException
from contextlib import contextmanager, redirect_stderr
from app.db.mongo import forex_prices_collection, users_collection, trades_collection
import asyncio
import traceback
import yfinance as yf
from datetime import datetime, time as dt_time, timezone as dt_tz
from pytz import timezone

NUMERIC_RE = re.compile(r"\d")
starting_now = time.time()

@contextmanager
def _suppress_child_stderr_during_startup():
    """
    Temporarily redirect FD 2 (stderr) to NUL so child processes (Chrome)
    can't print early startup logs (absl/voice_transcription) to console.
    """
    sys.stderr.flush()
    stderr_fd = sys.stderr.fileno()
    saved = os.dup(stderr_fd)
    devnull_fd = os.open(os.devnull, os.O_WRONLY)
    try:
        os.dup2(devnull_fd, stderr_fd)
        yield
    finally:
        os.dup2(saved, stderr_fd)
        os.close(saved)
        os.close(devnull_fd)

def _dismiss_consent(driver, timeout=5):
    try:
        WebDriverWait(driver, timeout).until(
            EC.any_of(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Accept')]")),
                EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Agree')]")),
                EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'I agree')]")),
            )
        ).click()
    except Exception:
        pass

def _wait_for_numeric_price(driver, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        for row in rows[:50]:
            tds = row.find_elements(By.CSS_SELECTOR, "td")
            if len(tds) >= 2:
                txt = tds[1].text.strip()
                if txt and txt.upper() != "N/A" and NUMERIC_RE.search(txt):
                    return True
        time.sleep(0.25)
    raise TimeoutException("No numeric price appeared in table cells")

def scrape_fxstreet_rendered(url: str):
    opts = Options()
    opts.add_argument("--headless=new")  # or "--headless" if 'new' isn't supported
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--remote-debugging-pipe")   # << removes "DevTools listening ..." message
    opts.add_argument("--log-level=3")            # fewer Chrome logs
    opts.add_argument("--disable-webgl")
    opts.add_argument("--disable-software-rasterizer")
    opts.add_experimental_option("excludeSwitches", ["enable-logging"])
    opts.add_argument("--log-file=NUL")
    opts.add_argument("--disable-features=LiveCaption,OnDeviceSpeechRecognition,SpeechRecognition")

    service = Service(ChromeDriverManager().install(), log_output=subprocess.DEVNULL)

    devnull = open(os.devnull, "w")
    with redirect_stderr(devnull), _suppress_child_stderr_during_startup():
        driver = webdriver.Chrome(service=service, options=opts)
    devnull.close()

    try:
        driver.get(url)
        _dismiss_consent(driver)

        # Wait for table to be present
        WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.CSS_SELECTOR, "table")))
        # Nudge scrolling to trigger lazy fill
        table = driver.find_element(By.CSS_SELECTOR, "table")
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", table)

        # Wait until at least one price is numeric (not N/A)
        _wait_for_numeric_price(driver, timeout=25)

        # Now parse rendered HTML
        html = driver.page_source
    finally:
        driver.quit()

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        return []

    out = []
    for tr in table.find_all("tr"):
        # do NOT use recursive=False; tables often nest spans/divs
        tds = tr.find_all("td", limit=2)
        if len(tds) < 2:
            continue

        a = tds[0].find("a")
        symbol = (a.get_text(strip=True) if a else tds[0].get_text(strip=True)).upper().replace(" ", "")
        price_text = tds[1].get_text(strip=True)

        if not symbol or "/" not in symbol:
            continue
        if not price_text or price_text.upper() == "N/A" or not NUMERIC_RE.search(price_text):
            continue

        out.append((symbol, float(price_text)))
    return out

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
    rows = scrape_fxstreet_rendered("https://www.fxstreet.com/rates-charts/rates")
    prices = {}
    for sym, px in rows:
        s = sym.replace(" ", "").upper()
        if "/" not in s:
            continue
        base, quote = s.split("/", 1)

        if base == 'XAU' or base == 'BTC':
            continue

        if quote == "USD":
            prices[f"{base}"] = float(px)
        elif base == "USD":
            prices[f"{quote}"] = 1.0 / float(px)
    return prices

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
async def get_forex_history(
    base: str,
    resolution: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 500,
) -> dict:
    try:
        base = base.strip().upper()
        if len(base) != 3:
            return {"error": f"Invalid base currency: {base}"}

        ticker = yf.Ticker(f"{base}USD=X")

        # Map resolution to (period, interval). For intraday Yahoo requires a period.
        res_map = {
            "1m": ("5d", "1m"),       # last 1 day of 1m candles
            "5m": ("7d", "5m"),       # last 7 days max
            "15m": ("60d", "15m"),    # last 60 days
            "60m": ("6mo", "60m"),   # ~2 years
            "4h": ("6mo", "60m"),
            "1d": ("5y", "1d"),       # daily candles up to 5 years
            "1d_ytd": ("ytd", "1d"),  # daily candles YTD
            "1wk": ("10y", "1wk"),    # 10 years of weekly candles
        }
        if resolution not in res_map:
            return {"error": f"Unsupported resolution: {resolution}"}

        period, interval = res_map[resolution]

        def load():
            # Intraday intervals: must use period
            if period:
                return ticker.history(period=period, interval=interval)
            # Daily+ can use explicit window if provided
            if start_ts and end_ts:
                return ticker.history(
                    start=datetime.fromtimestamp(start_ts, tz=dt_tz.utc),
                    end=datetime.fromtimestamp(end_ts, tz=dt_tz.utc),
                    interval=interval,
                )
            # Modest fallback (avoid 5y by default)
            if resolution == "1d_ytd":
                return ticker.history(period="ytd", interval="1d")
            return ticker.history(period="1y", interval=interval)

        df = await asyncio.to_thread(load)  # ← non-blocking

        if resolution == "4h":
            # Aggregate 1h candles into 4h buckets
            df = df.resample("4H").agg({
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum",
            }).dropna()

        rows = []
        for idx, row in df.iterrows():
            # robust UTC epoch seconds
            ts = int(idx.timestamp()) if getattr(idx, "tzinfo", None) else int(datetime(idx.year, idx.month, idx.day, idx.hour, idx.minute, idx.second, tzinfo=dt_tz.utc).timestamp())
            rows.append({
                "timestamp": ts,
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
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