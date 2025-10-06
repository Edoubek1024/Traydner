import { useState, useEffect } from "react";
import { auth } from "../../firebase/firebaseConfig";
import { CRYPTO_SYMBOLS, getCryptoDisplayName, CryptoTicker } from "../../config/cryptoConfig";
import { onIdTokenChanged } from "firebase/auth";
import { CryptoBalances, CryptoHistory, fetchCryptoBalances, fetchCryptoHistoryDb, fetchCryptoPrice } from "../../api/crypto";
import HistoryChart from "../../components/Charts/HistoryChart";
import ConfirmTradeModal from "../../components/Modals/ConfirmTradeModal"

type RangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

const RANGE_META: Record<RangeKey, { res: string; slice?: number | null }> = {
  "1D": { res: "5", slice: 288 },
  "1W": { res: "30", slice: 336 },
  "1M": { res: "120", slice: 360 },
  "3M": { res: "240", slice: 540 },
  "YTD": { res: "D", slice: 366 },
  "1Y": { res: "D", slice: 366 },
  "5Y": { res: "W", slice: 261 },
};

const CryptoTrade = () => {

  const [symbols] = useState<CryptoTicker[]>(CRYPTO_SYMBOLS);

  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTC");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, CryptoHistory | null>>({});
  const [balances, setBalances] = useState<CryptoBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<number>(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [range, setRange] = useState<RangeKey>("1D");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setBalances(null);
        return;
      }
      try {
        const b = await fetchCryptoBalances();
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
        const p = await fetchCryptoPrice(selectedSymbol);
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

  async function fetchCandlesInChunks(
    symbol: string,
    res: string,
    start: number | undefined,
    end: number | undefined,
    needed: number
  ): Promise<any[]> {
    const data = await fetchCryptoHistoryDb(symbol, res, {
      start,
      end,
      limit: needed,
    });
    return data.history ?? [];
  }

  useEffect(() => {
    let ignore = false;
    const cacheKey = `${selectedSymbol}|${range}`;

    async function loadSelectedCryptoHistory() {
      if (history[cacheKey]?.history?.length) return;
      setHistoryLoading(true);
      try {
        const { res, slice: sliceCount } = RANGE_META[range];
        let candles: any[] = [];

        const now = Math.floor(Date.now() / 1000);

        if (range === "1D") {
          const now = Math.floor(Date.now() / 1000);
          const oneDayAgo = now - 24 * 60 * 60;
          candles = await fetchCandlesInChunks(selectedSymbol, res, oneDayAgo, now, RANGE_META["1D"].slice ?? 288);
        } else if (range === "1W") {
          const oneWeekAgo = now - 7 * 24 * 60 * 60;
          candles = await fetchCandlesInChunks(selectedSymbol, res, oneWeekAgo, now, sliceCount ?? 390);
        } else if (range === "1M") {
          const oneMonthAgo = now - 30 * 24 * 60 * 60;
          candles = await fetchCandlesInChunks(selectedSymbol, res, oneMonthAgo, now, sliceCount ?? 1000);
        } else if (range === "3M") {
          const threeMonthsAgo = now - 90 * 24 * 60 * 60;
          candles = await fetchCandlesInChunks(selectedSymbol, res, threeMonthsAgo, now, sliceCount ?? 1000);
        } else if (range === "YTD") {
          const jan1 = Math.floor(Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000);
          candles = await fetchCandlesInChunks(selectedSymbol, res, jan1, now, sliceCount ?? 1000);
        } else if (range === "1Y") {
          const oneYearAgo = now - 365 * 24 * 60 * 60;
          candles = await fetchCandlesInChunks(selectedSymbol, res, oneYearAgo, now, sliceCount ?? 1000);
        } else if (range === "5Y") {
          const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60;
          candles = await fetchCandlesInChunks(selectedSymbol, res, fiveYearsAgo, now, sliceCount ?? 260);
        }

        if (sliceCount && candles.length > sliceCount) {
          candles = candles.slice(-sliceCount);
        }

        if (!ignore) {
          setHistory(prev => ({
            ...prev,
            [cacheKey]: { symbol: selectedSymbol, resolution: res, history: candles },
          }));
        }
      } catch (err) {
        if (!ignore) {
          console.error(`Error fetching crypto history for ${selectedSymbol} (${range}):`, err);
          setHistory(prev => ({ ...prev, [cacheKey]: null }));
        }
      } finally {
        if (!ignore) setHistoryLoading(false);
      }
    }

    loadSelectedCryptoHistory();
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

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    async function refresh() {
      try {
        const p = await fetchCryptoPrice(selectedSymbol);
        setPrices(prev => ({ ...prev, [selectedSymbol]: p }));

        const cacheKey = `${selectedSymbol}|${range}`;
        const { res, slice: sliceCount } = RANGE_META[range];
        const now = Math.floor(Date.now() / 1000);

        // compute start for the active range
        let start: number | undefined;
        if (range === "1D")        start = now - 24 * 60 * 60;
        else if (range === "1W")   start = now - 7  * 24 * 60 * 60;
        else if (range === "1M")   start = now - 30 * 24 * 60 * 60;
        else if (range === "3M")   start = now - 90 * 24 * 60 * 60;
        else if (range === "YTD")  start = Math.floor(Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000);
        else if (range === "1Y")   start = now - 365 * 24 * 60 * 60;
        else if (range === "5Y")   start = now - 5 * 365 * 24 * 60 * 60;

        // ask for at most the range's slice (matches server caps)
        const limit = sliceCount ?? 500;

        const candles = await fetchCandlesInChunks(
          selectedSymbol,
          res,
          start,
          now,
          limit
        );

        setHistory(prev => ({
          ...prev,
          [cacheKey]: { symbol: selectedSymbol, resolution: res, history: candles.slice(-(sliceCount ?? candles.length)) },
        }));
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

  function getQuantityStep(price: number | undefined) {
    if (!price || price <= 0) return 0.00000001;

    if (price > 1000) return 0.00001;
    if (price > 100) return 0.0001;
    if (price > 10) return 0.001;
    if (price > 1) return 0.01;
    if (price > 0.1) return 0.1;
    return 1;
  }

  async function refreshBalances() {
    try {
      const b = await fetchCryptoBalances();
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

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/crypto/order`, {
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
  const qtyStep = getQuantityStep(selectedPrice);

  const fmtQty = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const fmtUsd = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const holdingQty =
    balances ? (balances.crypto[selectedSymbol] ?? 0) : 0;
  const holdingVal =
    holdingQty && selectedPrice ? holdingQty * selectedPrice : 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const price = prices[selectedSymbol];

    if (!Number.isFinite(price)) {
      setError("Price unavailable.");
      return;
    }
    if (!quantity || quantity <= 0 || Number.isNaN(quantity)) {
      setError("Enter a valid quantity.");
      return;
    }
    if (price * quantity < 0.01) {
      setError("Total trade amount must be at least $0.01");
      return;
    }

    // Open the confirm modal
    setConfirmOpen(true);
  };

  const RangeButton = ({ value, label }: { value: RangeKey; label: string }) => (
    <button
      type="button"
      onClick={() => setRange(value)}
      className={`px-3 py-1 rounded-md border transition ${
        range === value
          ? "bg-yellow-600 text-white border-yellow-500"
          : "bg-gray-700 text-gray-200 border-yellow-700 hover:bg-gray-600"
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
          <h1 className="text-4xl font-bold text-white mb-2">Cryptocurrency Trading Dashboard</h1>
        </div>

        {/* Crypto Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white mb-2">
            Select Crypto
          </label>
          <select 
            value={selectedSymbol} 
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-72 px-3 py-2 border border-yellow-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol} - {getCryptoDisplayName(symbol)}
              </option>
            ))}
          </select>
        </div>

        {/* Buy/Sell Section */}
        <div className="mb-6 bg-gray-800 rounded-lg border border-yellow-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Trade {selectedSymbol} - {getCryptoDisplayName(selectedSymbol)}
          </h2>

          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-700 border border-yellow-600 rounded-md p-3">
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
            <div className="bg-gray-700 border border-yellow-600 rounded-md p-3">
              <p className="text-xs text-gray-300">
                Holdings
              </p>
              <p className="text-lg text-white font-semibold">
                {balances ? (
                  <>
                    {fmtQty(holdingQty)} {selectedSymbol} (
                    {selectedPrice ? `$${fmtUsd(holdingVal)}` : "—"})
                  </>
                ) : "—"}
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
                value={
                  selectedPrice != null
                    ? selectedPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })
                    : ""
                }
                className="w-full px-3 py-2 border border-yellow-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                className="w-full px-3 py-2 border border-yellow-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                step={qtyStep}
                min="0"
                value={Number.isNaN(quantity) ? "" : quantity}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setQuantity(val);
                }}
                className="w-full px-3 py-2 border border-yellow-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent placeholder-gray-400"
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
                    ? (selectedPrice * quantity).toLocaleString(undefined, { maximumFractionDigits: 8 })
                    : "N/A"
                }
                className="w-full px-3 py-2 border border-yellow-600 rounded-md bg-gray-600 text-gray-300 cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                className={"w-full font-medium py-2 px-4 rounded-md transition bg-yellow-600 text-white hover:bg-yellow-700"}
              >
                Submit Order
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
        <div className="bg-gray-800 rounded-lg border border-yellow-700 p-6">
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading prices...</p>
              </div>
            </div>
          ) : historyLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading {selectedSymbol} history...</p>
              </div>
            </div>
          ) : (
            <div>
              <HistoryChart
                symbol={selectedSymbol}
                price={prices[selectedSymbol]}
                candles={history[`${selectedSymbol}|${range}`]?.history ?? []}
                yLabel="Price"
                color="#e0d700"
                fill="rgba(240,215,0,0.2)"
                decimals={2}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CryptoTrade;