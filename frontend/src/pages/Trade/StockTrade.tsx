import StockChart from "../../components/Charts/StockChart";
import { fetchStockPrice, fetchStockHistory, StockHistory } from "../../api/stocks";
import { useState, useEffect } from "react";
import { auth } from "../../firebase/firebaseConfig";

const StockTrade = () => {
  const [symbols] = useState<string[]>([
    "AAPL", 
    "GOOGL", 
    "TSLA", 
    "AMZN"
  ]);

  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, StockHistory | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<number>(1);

  useEffect(() => {
    async function loadPrices() {
      const results: Record<string, number> = {};
      for (const symbol of symbols) {
        try {
          const price = await fetchStockPrice(symbol);
          results[symbol] = price;
        } catch (err) {
          console.error(`Error fetching ${symbol}:`, err);
          results[symbol] = NaN;
        }
      }
      setPrices(results);
    }

    async function loadHistory() {
      const results: Record<string, StockHistory | null> = {};
      for (const symbol of symbols) {
        try {
          const data = await fetchStockHistory(symbol, "30");
          results[symbol] = data;
        } catch (err) {
          console.error(`Error fetching history for ${symbol}:`, err);
          results[symbol] = null;
        }
      }
      setHistory(results);
      setLoading(false);
    }

    loadPrices();
    loadHistory();
  }, [symbols]);

  const selectedCandles = history[selectedSymbol]?.history ?? [];
  const selectedPrice = prices[selectedSymbol];

  const getStockDisplayName = (symbol: string) => {
    const stockNames: Record<string, string> = {
      "AAPL": "Apple Inc.",
      "GOOGL": "Alphabet Inc.",
      "TSLA": "Tesla Inc.",
      "AMZN": "Amazon.com Inc."
    };
    return stockNames[symbol] || symbol;
  };

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

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/trades/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Trade request failed");
      }

      const data = await res.json();
      console.log("✅ Trade submitted:", data);
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Stock Trading Dashboard</h1>
          <p className="text-muted-foreground">Monitor and analyze stock performance in real-time</p>
        </div>

        {/* Stock Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Select Stock
          </label>
          <select 
            value={selectedSymbol} 
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-72 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol} - {getStockDisplayName(symbol)}
              </option>
            ))}
          </select>
        </div>

        {/* Buy/Sell Section */}
        <div className="mb-6 bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold text-card-foreground mb-4">
            Trade {selectedSymbol} - {getStockDisplayName(selectedSymbol)}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Action: Buy/Sell */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Action
              </label>
              <select
                value={tradeAction}
                onChange={(e) => setTradeAction(e.target.value as "buy" | "sell")}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Shares"
              />
            </div>

            {/* Price (read-only for now) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Price
              </label>
              <input
                type="text"
                value={selectedPrice ? `$${selectedPrice.toFixed(2)}` : "N/A"}
                readOnly
                className="w-full px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                className="w-full bg-primary text-gray-700 font-medium py-2 px-4 rounded-md bg-gray-100 hover:bg-gray-300 transition"
              >
                Submit Order
              </button>
            </div>
          </form>
        </div>

        {/* Main Chart */}
        <div className="bg-card rounded-lg border p-6">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading stock data...</p>
              </div>
            </div>
          ) : (
            <StockChart
              symbol={selectedSymbol}
              price={selectedPrice}
              candles={selectedCandles}
            />
          )}
        </div>

        {/* Stock Details */}
        <div className="mt-6 bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold text-card-foreground mb-4">
            {selectedSymbol} - {getStockDisplayName(selectedSymbol)}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-secondary rounded-lg">
              <h3 className="font-medium text-secondary-foreground mb-1">Current Price</h3>
              <p className="text-2xl font-bold text-secondary-foreground">
                ${selectedPrice ? selectedPrice.toFixed(2) : "N/A"}
              </p>
            </div>
            <div className="p-4 bg-secondary rounded-lg">
              <h3 className="font-medium text-secondary-foreground mb-1">Data Points</h3>
              <p className="text-2xl font-bold text-secondary-foreground">
                {selectedCandles.length}
              </p>
            </div>
            <div className="p-4 bg-secondary rounded-lg">
              <h3 className="font-medium text-secondary-foreground mb-1">Status</h3>
              <p className="text-lg font-semibold text-secondary-foreground">
                {selectedPrice && !isNaN(selectedPrice) ? "Active" : "Unavailable"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockTrade;