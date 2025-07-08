import { useEffect, useState } from "react";
import { fetchStockPrice } from "./api/stocks";

function App() {
  const [message, setMessage] = useState("");

  const [symbols] = useState<string[]>([
    "AAPL", 
    "GOOGL", 
    "TSLA", 
    "AMZN"
  ]);
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() =>{
    async function loadPrices() {
      const results: Record<string, number> = {};
      for (const symbol of symbols) {
        try {
          const price = await fetchStockPrice(symbol);
          results[symbol] = price;
        } catch (err) {
          console.error(`Error fetching ${symbol}:`, err)
          results[symbol] = NaN;
        }
      }
      setPrices(results);
    }

    loadPrices();
  }, [symbols]);
  

  return (
    <div className="p-10 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">🚀 Tailwind Is Working!</h1>

      <h2 className="text-2xl font-semibold mb-2">Symbols:</h2>
      <ul className="list-disc list-inside text-lg text-gray-800">
        {symbols.map((symbol) => (
          <li key={symbol}>{symbol}: {prices[symbol]}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
