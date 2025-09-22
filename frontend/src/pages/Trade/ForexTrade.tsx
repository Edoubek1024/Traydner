import { useState, useEffect } from "react";
import { fetchForexPrice, ForexHistory, fetchForexHistory, fetchForexBalances, ForexBalances, fetchMarketStatus } from "../../api/forex";
import { FOREX_SYMBOLS, ForexTicker, getForexDisplayName } from "../../config/forexConfig";
import { auth } from "../../firebase/firebaseConfig";
import { onIdTokenChanged } from "firebase/auth";
import HistoryChart from "../../components/Charts/HistoryChart";
import ConfirmTradeModal from "../../components/Modals/ConfirmTradeModal";

type RangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

const RANGE_META: Record<RangeKey, { res: string }> = {
  "1D": { res: "1" },   // backend maps "1" -> 1m
  "1W": { res: "15" },  // backend maps "15" -> 15m
  "1M": { res: "60" },  // backend maps "60" -> 60m
  "3M": { res: "240" },
  "YTD": { res: "DY" }, // backend maps "DY" -> 1d_ytd
  "1Y": { res: "D" },   // backend maps "D" -> 1d
  "5Y": { res: "W" },   // backend maps "W" -> 1wk
};

const ForexTrade = () => {

  const [symbols] = useState<ForexTicker[]>(FOREX_SYMBOLS);

  const [selectedSymbol, setSelectedSymbol] = useState<string>("EUR");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, ForexHistory | null>>({});
  const [balances, setBalances] = useState<ForexBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<number>(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("1D");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const isOpen = await fetchMarketStatus();
        setMarketOpen(isOpen);
      } catch (err) {
        console.error("Failed to fetch forex market status:", err);
        setMarketOpen(false);
      }
    })();
  }, []);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setBalances(null);
        return;
      }
      try {
        const b = await fetchForexBalances();
        setBalances(b);
      } catch (e) {
        console.error("Balance fetch failed:", e);
        setBalances(null);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const p = await fetchForexPrice(selectedSymbol);
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
  let ignore = false;
  const cacheKey = `${selectedSymbol}|${range}`;

  async function loadSelectedHistory() {
    if (history[cacheKey]?.history?.length) return;

    setHistoryLoading(true);
    try {
      const { res } = RANGE_META[range];
      const data = await fetchForexHistory(selectedSymbol, res);

      let candles = data.history ?? [];

      const toSec = (t: number) => (t > 1e12 ? Math.floor(t / 1000) : t);

      if (range === "1D") {
        const nowSec = Math.floor(Date.now() / 1000);
        const cutoff = nowSec - 24 * 60 * 60; // last 24h
        candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
      }
      if (range === "1W") {
        const nowSec = Math.floor(Date.now() / 1000);
        const cutoff = nowSec - 7 * 24 * 60 * 60; // last 7 days
        candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
      }
      if (range === "1M") {
        const nowSec = Math.floor(Date.now() / 1000);
        const cutoff = nowSec - 30 * 24 * 60 * 60; // last 30 days
        candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
      }
      if (range === "3M") {
        const nowSec = Math.floor(Date.now() / 1000);
        const cutoff = nowSec - 90 * 24 * 60 * 60; // last 90 days
        candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
      }
      if (range === "YTD") {
        const now = new Date();
        const jan1UtcSec = Math.floor(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0) / 1000);
        candles = candles.filter(c => toSec(c.timestamp) >= jan1UtcSec);
      }
      if (range === "1Y") {
        const now = new Date();
        const cutoff = Math.floor(
          Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) / 1000
        );
        candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
      }
      if (range === "5Y") {
        const now = new Date();
        const cutoff = Math.floor(
          Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) / 1000
        );
        candles = candles.filter(c => toSec(c.timestamp) >= cutoff);
      }

      const trimmed: ForexHistory = { ...data, history: candles };

      if (!ignore) setHistory(prev => ({ ...prev, [cacheKey]: trimmed }));
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
      return () => clearInterval(interval);
    }, msUntilNextMinute);

    return () => clearTimeout(timeout);
  }

  async function refreshBalances() {
    try {
      const b = await fetchForexBalances();
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
      if (price * quantity < 0.01) {
        throw new Error("Total trade amount must be at least $0.01");
      }

      const payload = { symbol: selectedSymbol, action: tradeAction, quantity, price };

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/forex/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || data?.detail || "Trade request failed");
      }
      await res.json();

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
    if (price * quantity < 0.01) { setError("Total trade amount must be at least $0.01"); return; }
    if (marketOpen === false) { setError("Market is closed."); return; }

    setConfirmOpen(true);
  };

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    async function refresh() {
      try {
        const isOpen = await fetchMarketStatus();
        setMarketOpen(isOpen);

        const p = await fetchForexPrice(selectedSymbol);
        setPrices(prev => ({ ...prev, [selectedSymbol]: p }));

        const cacheKey = `${selectedSymbol}|${range}`;
        const { res } = RANGE_META[range];

        if (range === "1D") {
          const data = await fetchForexHistory(selectedSymbol, res);
          setHistory(prev => ({
            ...prev,
            [cacheKey]: { ...data, history: data.history ?? [] },
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
          ? "bg-indigo-600 text-white border-indigo-500"
          : "bg-gray-700 text-gray-200 border-indigo-700 hover:bg-gray-600"
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
          <h1 className="text-4xl font-bold text-white mb-2">Foreign Exchange Trading Dashboard</h1>
        </div>

        {/* Forex Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white mb-2">
            Select Forex Symbol
          </label>
          <select 
            value={selectedSymbol} 
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-72 px-3 py-2 border border-indigo-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol} - {getForexDisplayName(symbol)}
              </option>
            ))}
          </select>
        </div>

        {/* Buy/Sell Section */}
        <div className="mb-6 bg-gray-800 rounded-lg border border-indigo-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Trade {selectedSymbol} - {getForexDisplayName(selectedSymbol)}
          </h2>

          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-700 border border-indigo-600 rounded-md p-3">
              <p className="text-xs text-gray-300">Cash</p>
              <p className="text-lg text-white font-semibold">
                {balances
                  ? `$${balances.cash.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`
                  : "—"}
              </p>
            </div>
            <div className="bg-gray-700 border border-indigo-600 rounded-md p-3">
              <p className="text-xs text-gray-300">
                Holdings
              </p>
              <p className="text-lg text-white font-semibold">
                {balances ? (balances.forex[selectedSymbol] ?? 0) : "—"}{" "}
                {selectedSymbol} (
                  {balances && prices[selectedSymbol]
                    ? `$${(((balances.forex[selectedSymbol] ?? 0) * (prices[selectedSymbol] ?? 0))).toFixed(2)}`
                    : "—"}
                )
              </p>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-white mb-3">
            Place Order
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            {/* Price (read-only for now) */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Price
              </label>
              <input
                type="text"
                readOnly
                value={selectedPrice != null ? selectedPrice : ""}
                className="w-full px-3 py-2 border border-indigo-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Action: Buy/Sell */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Action
              </label>
              <select
                value={tradeAction}
                onChange={(e) => setTradeAction(e.target.value as "buy" | "sell")}
                className="w-full px-3 py-2 border border-indigo-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Quantity ({selectedSymbol})
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={Number.isNaN(quantity) ? "" : quantity}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setQuantity(val);
                }}
                className="w-full px-3 py-2 border border-indigo-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
                placeholder={`Amount of ${selectedSymbol}`}
              />
            </div>

            {/* Total Cost */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Total Cost
              </label>
              <input
                type="text"
                readOnly
                value={
                  selectedPrice && quantity > 0
                    ? `$${(selectedPrice * quantity).toFixed(2)}`
                    : "N/A"
                }
                className="w-full px-3 py-2 border border-indigo-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={marketOpen === false}
                className={`w-full font-medium py-2 px-4 rounded-md transition ${
                  marketOpen === false
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
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
              <div className="md:col-span-5 text-green-500 bg-green-900 border border-green-700 rounded-md p-3 mb-2">
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
        <div className="bg-gray-800 rounded-lg border border-indigo-700 p-6">
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading prices...</p>
              </div>
            </div>
          ) : historyLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
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
                color="#6366f1"
                fill="rgba(99,102,241,0.2)"
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

export default ForexTrade;