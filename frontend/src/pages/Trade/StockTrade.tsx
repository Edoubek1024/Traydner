import { fetchStockPrice, fetchStockHistory, StockHistory, fetchMarketStatus } from "../../api/stocks";
import { useState, useEffect } from "react";
import { auth } from "../../firebase/firebaseConfig";
import { SYMBOLS, getStockDisplayName, Ticker } from "../../config/stocksConfig";
import { fetchStockBalances, StockBalances } from "../../api/stocks";
import { onIdTokenChanged } from "firebase/auth";
import HistoryChart from "../../components/Charts/HistoryChart";
import ConfirmTradeModal from "../../components/Modals/ConfirmTradeModal";

type RangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

const RANGE_META: Record<RangeKey, { res: string; slice?: number | null }> = {
  "1D": { res: "1",  slice: 389 },
  "1W": { res: "5", slice: 390  },
  "1M": { res: "30",  slice: null  },
  "3M": { res: "60",  slice: null  },
  "YTD":{ res: "D",  slice: null },
  "1Y": { res: "D",  slice: null },
  "5Y": { res: "W",  slice: 260 },
};

const toSec = (t: number) => (t > 1e12 ? Math.floor(t / 1000) : t);

const dateKeyET = (tsSec: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsSec * 1000));

const StockTrade = () => {
  const [symbols] = useState<Ticker[]>(SYMBOLS);

  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, StockHistory | null>>({});
  const [balances, setBalances] = useState<StockBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<number>(0);
  const [marketOpen, setMarketOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [range, setRange] = useState<RangeKey>("1D");

  useEffect(() => {
    (async () => {
      try {
        const isOpen = await fetchMarketStatus();
        setMarketOpen(isOpen);
      } catch {
        setMarketOpen(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const p = await fetchStockPrice(selectedSymbol);
        if (!cancelled) {
          setPrices(prev => ({ ...prev, [selectedSymbol]: p }));
        }
      } catch {
        if (!cancelled) {
          setPrices(prev => ({ ...prev, [selectedSymbol]: NaN }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedSymbol]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    let inFlight = false;

    const shouldPoll = () =>
      document.visibilityState === "visible" && marketOpen !== false && !!selectedSymbol;

    const tick = async () => {
      if (inFlight || !shouldPoll()) return;
      inFlight = true;
      try {
        const p = await fetchStockPrice(selectedSymbol);
        if (!cancelled) {
          setPrices(prev => ({ ...prev, [selectedSymbol]: p }));
        }
      } finally {
        inFlight = false;
      }
    };

    tick();
    intervalId = window.setInterval(tick, 20000);

    const onVis = () => { if (shouldPoll()) tick(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [selectedSymbol, marketOpen]);

  useEffect(() => {
    let ignore = false;
    const cacheKey = `${selectedSymbol}|${range}`;

    async function loadSelectedHistory() {
      if (history[cacheKey]?.history?.length) return;

      setHistoryLoading(true);
      try {
        const { res, slice } = RANGE_META[range];
        const data = await fetchStockHistory(selectedSymbol, res);

        let candles = data.history ?? [];
        if (range === "1D") {
          const daily = await fetchStockHistory(selectedSymbol, "D");
          const lastDaily = daily.history?.[daily.history.length - 1];
          if (lastDaily) {
            const target = dateKeyET(toSec(lastDaily.timestamp));
            candles = candles.filter(c => dateKeyET(toSec(c.timestamp)) === target);
          }
        }
        if (range === "1W") {
          const nowSec = Math.floor(Date.now() / 1000);
          const cutoff = nowSec - 7 * 24 * 60 * 60;
          candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
        }
        if (range === "1M") {
          const THIRTY_DAYS = 30 * 24 * 60 * 60;
          const nowSec = Math.floor(Date.now() / 1000);
          const cutoff = nowSec - THIRTY_DAYS;
          candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
        }
        if (range === "3M") {
          const now = new Date();
          const startUtcMs = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - 3,
            now.getUTCDate(),
            0, 0, 0
          );
          const cutoff = Math.floor(startUtcMs / 1000);
          candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
        }
        if (range === "YTD") {
          const now = new Date();
          const jan1UtcSec = Math.floor(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0) / 1000);
          candles = candles.filter(c => toSec(c.timestamp) >= jan1UtcSec);
        }
        if (range === "1Y") {
          const now = new Date();
          const startUtcSec = Math.floor(
            Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) / 1000
          );
          candles = candles.filter(c => toSec(c.timestamp) >= startUtcSec);
        }
        if (typeof slice === "number" && slice > 0 && candles.length > slice) {
          candles = candles.slice(-slice);
        }

        const trimmed: StockHistory = { ...data, history: candles };

        if (!ignore) {
          setHistory(prev => ({ ...prev, [cacheKey]: trimmed }));
        }
      } catch (err) {
        if (!ignore) {
          console.error(`Error fetching history for ${selectedSymbol} (${range}):`, err);
          setHistory(prev => ({ ...prev, [cacheKey]: null }));
        }
      } finally {
        if (!ignore) setHistoryLoading(false);
      }
    }

    loadSelectedHistory();
    return () => { ignore = true; };
  }, [selectedSymbol, range]);

  function scheduleEveryMinute(callback: () => void) {
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    const timeout = setTimeout(() => {
      callback();
      const interval = setInterval(callback, 60 * 1000);
      (callback as any)._interval = interval;
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeout);
      if ((callback as any)._interval) {
        clearInterval((callback as any)._interval);
      }
    };
  }

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setBalances(null);
        return;
      }
      try {
        const b = await fetchStockBalances();
        setBalances(b);
      } catch (e) {
        console.error("Balance fetch failed:", e);
        setBalances(null);
      }
    });

    return () => unsub();
  }, []);

  async function refreshBalances() {
    try {
      const b = await fetchStockBalances();
      setBalances(b);
    } catch (e) {
      console.error("Refresh balances failed:", e);
    }
  }

  async function placeOrder() {
    setConfirming(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be logged in to place a trade.");
      if (marketOpen === false) throw new Error("Market is closed.");

      const idToken = await user.getIdToken();

      const price = prices[selectedSymbol];
      if (!Number.isFinite(price)) throw new Error("Price unavailable.");
      if (!quantity || quantity <= 0 || Number.isNaN(quantity)) {
        throw new Error("Enter a valid quantity.");
      }

      const payload = { symbol: selectedSymbol, action: tradeAction, quantity, price };

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stocks/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || data?.detail || "Trade request failed");
      }
      await res.json();

      // ✅ update holdings immediately
      await refreshBalances();

      const actionWord = tradeAction === "buy" ? "bought" : "sold";
      setError(null);
      setSuccessMessage(`Successfully ${actionWord} ${quantity} ${selectedSymbol} at $${price.toFixed(2)}`);
    } catch (err: any) {
      const cleaned = (err?.message || "")
        .replace(/^Error:\s*/, "")
        .replace(/\s*\([^\)]*\)\s*$/, "")
        .trim();
      setError(cleaned || "Trade failed");
    } finally {
      setConfirming(false);
      setConfirmOpen(false);
      setQuantity(0);
    }
  }

  const selectedPrice = prices[selectedSymbol];
  const cacheKey = `${selectedSymbol}|${range}`;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const price = prices[selectedSymbol];
    if (!Number.isFinite(price)) { setError("Price unavailable."); return; }
    if (!quantity || quantity <= 0 || Number.isNaN(quantity)) { setError("Enter a valid quantity."); return; }
    if (marketOpen === false) { setError("Market is closed."); return; }

    setConfirmOpen(true);
  };

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    async function refresh() {
      try {
        // market status
        const isOpen = await fetchMarketStatus();
        setMarketOpen(isOpen);

        // price
        const p = await fetchStockPrice(selectedSymbol);
        setPrices(prev => ({ ...prev, [selectedSymbol]: p }));

        // intraday history
        if (range === "1D") {
          const { res } = RANGE_META[range];
          const data = await fetchStockHistory(selectedSymbol, res);

          // filter to today’s candles
          const daily = await fetchStockHistory(selectedSymbol, "D");
          const lastDaily = daily.history?.[daily.history.length - 1];
          let candles = data.history ?? [];
          if (lastDaily) {
            const target = dateKeyET(toSec(lastDaily.timestamp));
            candles = candles.filter(c => dateKeyET(toSec(c.timestamp)) === target);
          }

          const cacheKey = `${selectedSymbol}|${range}`;
          setHistory(prev => ({
            ...prev,
            [cacheKey]: { ...data, history: candles },
          }));
        }
      } catch (err) {
        console.error("Minute refresh failed:", err);
      }
    }

    cleanup = scheduleEveryMinute(refresh);
    refresh();

    return () => {
      if (cleanup) cleanup();
    };
  }, [selectedSymbol, range]);

  const RangeButton = ({ value, label }: { value: RangeKey; label: string }) => (
    <button
      type="button"
      onClick={() => setRange(value)}
      className={`px-3 py-1 rounded-md border transition ${
        range === value
          ? "bg-emerald-600 text-white border-emerald-500"
          : "bg-gray-700 text-gray-200 border-emerald-700 hover:bg-gray-600"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Stock Trading Dashboard</h1>
        </div>

        {/* Stock Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white mb-2">Select Stock</label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-72 px-3 py-2 border border-emerald-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol} - {getStockDisplayName(symbol)}
              </option>
            ))}
          </select>
        </div>

        {/* Buy/Sell Section */}
        <div className="mb-6 bg-gray-800 rounded-lg border border-emerald-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Trade {selectedSymbol} - {getStockDisplayName(selectedSymbol)}
          </h2>

          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-700 border border-emerald-600 rounded-md p-3">
              <p className="text-xs text-gray-300">Cash</p>
              <p className="text-lg text-white font-semibold">
                {balances
                  ? `$${balances.cash.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "—"}
              </p>
            </div>
            <div className="bg-gray-700 border border-emerald-600 rounded-md p-3">
              <p className="text-xs text-gray-300">Holdings</p>
              <p className="text-lg text-white font-semibold">
                {balances ? (balances.stocks[selectedSymbol] ?? 0) : "—"}{" "}
                {balances?.stocks[selectedSymbol] != 1 ? "shares" : "share"} (
                  {balances && prices[selectedSymbol]
                    ? `$${(((balances.stocks[selectedSymbol] ?? 0) * (prices[selectedSymbol] ?? 0))).toFixed(2)}`
                    : "—"}
                )
              </p>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-white mb-3">Place Order</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">Price</label>
              <input
                type="text"
                value={selectedPrice ? `$${selectedPrice.toFixed(2)}` : "N/A"}
                readOnly
                className="w-full px-3 py-2 border border-emerald-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed"
              />
            </div>

            {/* Action */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">Action</label>
              <select
                value={tradeAction}
                onChange={(e) => setTradeAction(e.target.value as "buy" | "sell")}
                className="w-full px-3 py-2 border border-emerald-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">Quantity</label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-emerald-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-gray-400"
                placeholder="Shares"
              />
            </div>

            {/* Total Cost */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">Total Cost</label>
              <input
                type="text"
                value={
                  selectedPrice && quantity > 0
                    ? `$${(selectedPrice * quantity).toFixed(2)}`
                    : "N/A"
                }
                readOnly
                className="w-full px-3 py-2 border border-emerald-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed"
              />
            </div>

            {/* Submit */}
            <div>
              <button
                type="submit"
                disabled={marketOpen === false}
                className={`w-full font-medium py-2 px-4 rounded-md transition ${
                  marketOpen === false
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {marketOpen === false ? "Market Closed" : "Submit Order"}
              </button>
            </div>

            {error && (
              <div className="md:col-span-5 text-red-400 bg-red-900 border border-red-700 rounded-md p-3 mb-2">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="md:col-span-5 text-green-400 bg-green-900 border border-green-700 rounded-md p-3 mb-2">
                {successMessage}
              </div>
            )}
          </form>
        </div>

        <ConfirmTradeModal
          open={confirmOpen}
          action={tradeAction}
          symbol={selectedSymbol}
          quantity={Number.isNaN(quantity) ? 0 : quantity}
          price={prices[selectedSymbol]}
          confirming={confirming}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={placeOrder}
        />

        {/* Main Chart */}
        <div className="bg-gray-800 rounded-lg border border-emerald-700 p-6">
          {/* Range selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            <RangeButton value="1D" label="1 day" />
            <RangeButton value="1W" label="1 week" />
            <RangeButton value="1M" label="1 month" />
            <RangeButton value="3M" label="3 months" />
            <RangeButton value="YTD" label="YTD" />
            <RangeButton value="1Y" label="1 year" />
            <RangeButton value="5Y" label="5 years" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading prices...</p>
              </div>
            </div>
          ) : historyLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading {selectedSymbol} history...</p>
              </div>
            </div>
          ) : (
            <div>
              <HistoryChart
                symbol={selectedSymbol}
                price={prices[selectedSymbol]}
                candles={history[cacheKey]?.history ?? []}
                yLabel="Price"
                color="#22c55e"
                fill="rgba(34,197,94,0.2)"
                decimals={2}
                marketOpen={marketOpen}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockTrade;
