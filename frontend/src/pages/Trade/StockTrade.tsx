import StockChart from "../../components/Charts/StockChart";
import { fetchStockPrice, fetchStockHistory, StockHistory, fetchMarketStatus } from "../../api/stocks";
import { useState, useEffect } from "react";
import { auth } from "../../firebase/firebaseConfig";
import { SYMBOLS, getStockDisplayName, Ticker } from "../../config/stocksConfig";
import { fetchStockBalances, StockBalances } from "../../api/stocks";
import { onIdTokenChanged } from "firebase/auth";


const StockTrade = () => {

  const [symbols] = useState<Ticker[]>(SYMBOLS);

  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, StockHistory | null>>({});
  const [balances, setBalances] = useState<StockBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<number>(0);
  const [marketOpen, setMarketOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      } catch {
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

    async function loadSelectedHistory() {
      if (history[selectedSymbol]?.history?.length) return;

      setHistoryLoading(true);
      try {
        const data = await fetchStockHistory(selectedSymbol, "30");
        if (!ignore) {
          setHistory(prev => ({ ...prev, [selectedSymbol]: data }));
        }
      } catch (err) {
        if (!ignore) {
          console.error(`Error fetching history for ${selectedSymbol}:`, err);
          setHistory(prev => ({ ...prev, [selectedSymbol]: null }));
        }
      } finally {
        if (!ignore) setHistoryLoading(false);
      }
    }

    loadSelectedHistory();
    return () => { ignore = true; };
  }, [selectedSymbol]);

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

  // const selectedCandles = history[selectedSymbol]?.history ?? [];
  const selectedPrice = prices[selectedSymbol];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be logged in to place a trade.");
      }

      const idToken = await user.getIdToken();

      const payload = {
        symbol: selectedSymbol,
        action: tradeAction,
        quantity,
        price: prices[selectedSymbol],
      };

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stocks/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || data?.detail || "Trade request failed");
      }

      const data = await res.json();
      console.log("✅ Trade submitted:", data);

      const actionWord = tradeAction === "buy" ? "bought" : "sold";
      setError(null); // clear any old error
      setSuccessMessage(
        `Successfully ${actionWord} ${quantity} ${selectedSymbol} at $${prices[selectedSymbol].toFixed(2)}`
      );
    } catch (err: any) {
      const rawMessage = err.message || "";
      const cleanedMessage = rawMessage
        .replace(/^Error:\s*/, "")
        .replace(/\s*\([^\)]*\)\s*$/, "")
        .trim();
      setError(cleanedMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Stock Trading Dashboard</h1>
        </div>

        {/* Stock Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white mb-2">
            Select Stock
          </label>
          <select 
            value={selectedSymbol} 
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-72 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol} - {getStockDisplayName(symbol)}
              </option>
            ))}
          </select>
        </div>

        {/* Buy/Sell Section */}
        <div className="mb-6 bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Trade {selectedSymbol} - {getStockDisplayName(selectedSymbol)}
          </h2>

          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-700 border border-gray-600 rounded-md p-3">
              <p className="text-xs text-gray-300">Cash</p>
              <p className="text-lg text-white font-semibold">
                {balances ? `$${balances.cash.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="bg-gray-700 border border-gray-600 rounded-md p-3">
              <p className="text-xs text-gray-300">
                Holdings
              </p>
              <p className="text-lg text-white font-semibold">
                {balances ? (balances.stocks[selectedSymbol] ?? 0) : "—"}{" "}
                shares (
                  {balances && prices[selectedSymbol]
                    ? `$${(((balances.stocks[selectedSymbol] ?? 0) * (prices[selectedSymbol] ?? 0))).toFixed(2)}`
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
                value={selectedPrice ? `$${selectedPrice.toFixed(2)}` : "N/A"}
                readOnly
                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed"
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
                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-gray-400"
                placeholder="Shares"
              />
            </div>

            {/* Total Cost */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Total Cost
              </label>
              <input
                type="text"
                value={
                  selectedPrice && quantity > 0
                    ? `$${(selectedPrice * quantity).toFixed(2)}`
                    : "N/A"
                }
                readOnly
                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed"
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
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {marketOpen === false ? "Market Closed" : "Submit Order"}
              </button>
            </div>

            {error && (
              <div className="md:col-span-4 text-red-400 bg-red-900 border border-red-700 rounded-md p-3 mb-2">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="md:col-span-4 text-green-400 bg-green-900 border border-green-700 rounded-md p-3 mb-2">
                {successMessage}
              </div>
            )}
          </form>
        </div>

        {/* Main Chart */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
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
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mx-auto mb-3"></div>
                <p className="text-gray-400">Loading {selectedSymbol} history...</p>
              </div>
            </div>
          ) : (
            <div className="-mb-8">
              <StockChart
                symbol={selectedSymbol}
                price={prices[selectedSymbol]}
                candles={history[selectedSymbol]?.history ?? []}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockTrade;