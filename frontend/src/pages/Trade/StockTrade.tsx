import { useState, useEffect } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { auth } from "../../firebase/firebaseConfig";

import {
  fetchStockPrice,
  fetchMarketStatus,
  fetchStockBalances,
  fetchStockHistoryDb,
  type StockBalances,
  type StockHistory,
} from "../../api/stocks";

import {
  SYMBOLS,
  getStockDisplayName,
  type Ticker,
} from "../../config/stocksConfig";

import HistoryChart from "../../components/Charts/HistoryChart";
import ConfirmTradeModal from "../../components/Modals/ConfirmTradeModal";
import { checkBackendHealth } from "../../config/probe";

type RangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

const RANGE_META: Record<RangeKey, { res: string; slice?: number | null }> = {
  "1D":  { res: "1",   slice: 390 },
  "1W":  { res: "5",   slice: 390 },
  "1M":  { res: "30",  slice: 286 },
  "3M":  { res: "60",  slice: 429 },
  "YTD": { res: "D",   slice: 251 },
  "1Y":  { res: "D",   slice: 251 },
  "5Y":  { res: "W",   slice: 260 },
};

const StockTrade = () => {
  const [symbols] = useState<Ticker[]>(SYMBOLS);

  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [range, setRange] = useState<RangeKey>("1D");

  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, StockHistory | null>>({});
  const [balances, setBalances] = useState<StockBalances | null>(null);

  const [marketOpen, setMarketOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [backendDown, setBackendDown] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const ok = await checkBackendHealth();
      if (!cancelled) setBackendDown(!ok);
    }

    check();

    // Optional: re-check every 30s
    const interval = setInterval(check, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // --- Market status once on mount (initial paint)
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

  // --- Initial price fetch when symbol changes (for first render)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchStockPrice(selectedSymbol);
        if (!cancelled) setPrices(prev => ({ ...prev, [selectedSymbol]: p }));
      } catch {
        if (!cancelled) setPrices(prev => ({ ...prev, [selectedSymbol]: NaN }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSymbol]);

  // --- Load initial candles for selected symbol/range (from DB)
  useEffect(() => {
    let ignore = false;
    const cacheKey = `${selectedSymbol}|${range}`;

    async function loadSelectedHistory() {
      if (history[cacheKey]?.history?.length) return; // use cache on first show

      setHistoryLoading(true);
      try {
        const now = Math.floor(Date.now() / 1000);
        let candles: any[] = [];

        if (range === "1D") {
          // Snap to most recent trading day (ET midnight) via D bucket
          const daily = await fetchStockHistoryDb(selectedSymbol, "D", { limit: 1 });
          const lastDaily = daily.history?.[daily.history.length - 1];
          if (lastDaily?.timestamp) {
            const dayStart = Number(lastDaily.timestamp);
            const dayEnd = dayStart + 86400;
            const data = await fetchStockHistoryDb(selectedSymbol, "1", {
              start: dayStart,
              end: dayEnd,
              limit: RANGE_META["1D"].slice ?? 390,
            });
            candles = data.history ?? [];
          } else {
            candles = [];
          }
        } else if (range === "3M") {
          // Latest 60m candles; avoid calendar drift
          const data = await fetchStockHistoryDb(selectedSymbol, "60", {
            limit: RANGE_META["3M"].slice ?? 378,
          });
          candles = data.history ?? [];
        } else if (range === "5Y") {
          // Latest weekly candles; avoid calendar drift
          const data = await fetchStockHistoryDb(selectedSymbol, "W", {
            limit: RANGE_META["5Y"].slice ?? 260,
          });
          candles = data.history ?? [];
        } else {
          // Windowed ranges
          const { res, slice } = RANGE_META[range];
          let start: number | undefined;
          if (range === "1W")  start = now - 7  * 24 * 60 * 60;
          else if (range === "1M")  start = now - 30 * 24 * 60 * 60;
          else if (range === "YTD") start = Math.floor(Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000);
          else if (range === "1Y")
            start = Math.floor(
              Date.UTC(
                new Date().getUTCFullYear() - 1,
                new Date().getUTCMonth(),
                new Date().getUTCDate(),
                0, 0, 0
              ) / 1000
            );

          const data = await fetchStockHistoryDb(selectedSymbol, res, {
            start,
            end: now,
            limit: slice ?? 500,
          });
          candles = data.history ?? [];
        }

        // final clamp
        const max = RANGE_META[range].slice ?? 0;
        if (max && candles.length > max) candles = candles.slice(-max);

        if (!ignore) {
          setHistory(prev => ({
            ...prev,
            [cacheKey]: { symbol: selectedSymbol, resolution: RANGE_META[range].res, history: candles },
          }));
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
    // NOTE: do not include `history` in deps; we guard with cacheKey check
  }, [selectedSymbol, range]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- ONE consolidated refresher: price (20s) + history (minute-aligned)
  useEffect(() => {
    let cancelled = false;
    let priceInterval: number | undefined;
    let minuteTimeout: number | undefined;
    let minuteInterval: number | undefined;

    const fetchPrice = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const p = await fetchStockPrice(selectedSymbol);
        if (!cancelled) setPrices(prev => ({ ...prev, [selectedSymbol]: p }));
      } catch {}
    };

    const refreshHistory = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const isOpen = await fetchMarketStatus();
        if (!cancelled) setMarketOpen(isOpen);

        const now = Math.floor(Date.now() / 1000);
        let candles: any[] = [];

        if (range === "1D") {
          const daily = await fetchStockHistoryDb(selectedSymbol, "D", { limit: 1 });
          const lastDaily = daily.history?.[daily.history.length - 1];
          if (lastDaily?.timestamp) {
            const dayStart = Number(lastDaily.timestamp);
            const dayEnd = dayStart + 86400;
            const data = await fetchStockHistoryDb(selectedSymbol, "1", {
              start: dayStart,
              end: dayEnd,
              limit: RANGE_META["1D"].slice ?? 390,
            });
            candles = data.history ?? [];
          } else {
            candles = [];
          }
        } else if (range === "3M") {
          const data = await fetchStockHistoryDb(selectedSymbol, "60", {
            limit: RANGE_META["3M"].slice ?? 378,
          });
          candles = data.history ?? [];
        } else if (range === "5Y") {
          const data = await fetchStockHistoryDb(selectedSymbol, "W", {
            limit: RANGE_META["5Y"].slice ?? 260,
          });
          candles = data.history ?? [];
        } else {
          const { res, slice } = RANGE_META[range];
          let start: number | undefined;
          if (range === "1W")  start = now - 7  * 24 * 60 * 60;
          else if (range === "1M")  start = now - 30 * 24 * 60 * 60;
          else if (range === "YTD") start = Math.floor(Date.UTC(new Date().getUTCFullYear(),0,1)/1000);
          else if (range === "1Y")
            start = Math.floor(
              Date.UTC(
                new Date().getUTCFullYear()-1,
                new Date().getUTCMonth(),
                new Date().getUTCDate(),
                0,0,0
              ) / 1000
            );

          const data = await fetchStockHistoryDb(selectedSymbol, res, {
            start,
            end: now,
            limit: slice ?? 500,
          });
          candles = data.history ?? [];
        }

        const max = RANGE_META[range].slice ?? 0;
        if (max && candles.length > max) candles = candles.slice(-max);

        const cacheKey = `${selectedSymbol}|${range}`;
        if (!cancelled) {
          setHistory(prev => ({
            ...prev,
            [cacheKey]: {
              symbol: selectedSymbol,
              resolution: RANGE_META[range].res,
              history: candles,
            },
          }));
        }
      } catch (err) {
        console.error("History refresh failed:", err);
      }
    };

    // Kick off immediately
    fetchPrice();
    refreshHistory();

    // Price: every 20s
    priceInterval = window.setInterval(fetchPrice, 20_000);

    // History: align to top-of-minute, then every minute
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    minuteTimeout = window.setTimeout(() => {
      refreshHistory();
      minuteInterval = window.setInterval(refreshHistory, 60_000);
    }, msUntilNextMinute);

    // Refresh price immediately when tab becomes visible
    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchPrice();
        // If you also want instant history catch-up on focus, uncomment:
        // refreshHistory();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (priceInterval) clearInterval(priceInterval);
      if (minuteTimeout) clearTimeout(minuteTimeout);
      if (minuteInterval) clearInterval(minuteInterval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [selectedSymbol, range]);

  // --- Balances listener
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
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
      setSuccessMessage(
        `Successfully ${actionWord} ${quantity} ${selectedSymbol} at $${price.toFixed(2)}`
      );
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const price = prices[selectedSymbol];
    if (!Number.isFinite(price)) { setError("Price unavailable."); return; }
    if (!quantity || quantity <= 0 || Number.isNaN(quantity)) { setError("Enter a valid quantity."); return; }
    if (marketOpen === false) { setError("Market is closed."); return; }

    setConfirmOpen(true);
  };

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

  let content: React.ReactNode;

  if (backendDown === null) {
    content = (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
      </div>
    );
  } else if (backendDown === true) {
    content = (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 border border-emerald-700 rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">
            Backend services are temporarily down
          </h1>
          <p className="text-gray-400">
            Please try again later or contact an admin for further assistance.
          </p>
        </div>
      </div>
    );
  } else {
    content = (
      <>
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
                      {balances && selectedPrice
                        ? `$${(((balances.stocks[selectedSymbol] ?? 0) * selectedPrice)).toFixed(2)}`
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
                    value={Number.isNaN(quantity) ? 0 : quantity}
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
              price={selectedPrice}
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
                    price={selectedPrice}
                    candles={history[`${selectedSymbol}|${range}`]?.history ?? []}
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
      </>
    );
  }

  return <>{content}</>;
  
};

export default StockTrade;
