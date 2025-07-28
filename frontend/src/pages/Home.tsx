import { useEffect, useState } from "react";
import { fetchStockPrice, fetchStockHistory, StockHistory } from "../api/stocks";
import title from "../assets/Traydner_title.png";
import StockChart from "../components/Charts/StockChart";

export default function Home() {

  const [symbols] = useState<string[]>([
    "AAPL", 
    "GOOGL", 
    "TSLA", 
    "AMZN"
  ]);

  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, StockHistory | null>>({});

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

    async function loadHistory() {
      const results: Record<string, StockHistory | null> = {};
      for (const symbol of symbols) {
        try {
          const data = await fetchStockHistory(symbol, "D");
          results[symbol] = data;
        } catch (err) {
          console.error(`Error fetching history for ${symbol}:`, err);
          results[symbol] = null;
        }
      }
      setHistory(results);
    }

    loadPrices();
    loadHistory();
  }, [symbols]);

  useEffect(() => {
    console.log("Updated history:", history);
  }, [history]);

  return (
    <div>
      <div className="p-10 bg-gray-50 min-h-screen">
        <img src={title} alt="Title" className="w-80 h-auto" />
        {symbols.map((symbol) => {
          const candles = history[symbol]?.history ?? [];
          const price = prices[symbol];

          return (
            <StockChart
              key={symbol}
              symbol={symbol}
              price={price}
              candles={candles}
            />
          );
        })}
      </div>
    </div>

  );
}
