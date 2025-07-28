const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface StockCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockHistory {
  symbol: string;
  resolution: string;
  history: StockCandle[];
}

export async function fetchStockPrice(symbol: string): Promise<number> {
    const res = await fetch(`${BASE_URL}/api/price?symbol=${symbol}`);
    if (!res.ok) throw new Error("Failed to fetch stock price");
    const data = await res.json();
    return data.price;
}

export async function fetchStockHistory(symbol: string, resolution: string): Promise<StockHistory> {
  const res = await fetch(`${BASE_URL}/api/history?symbol=${symbol}&resolution=${resolution}`);
  if (!res.ok) throw new Error(`Failed to fetch history for ${symbol}`);
  const data = await res.json();
  return data;
}