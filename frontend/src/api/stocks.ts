import { auth } from "../firebase/firebaseConfig";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface StockCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type StockHistory = {
  symbol: string;
  resolution: string;
  history: Array<{
    timestamp: number;
    open?: number;
    high?: number;
    low?: number;
    close: number;
    volume?: number;
  }>;
  updatedAt?: number;
  source?: string;
};

export type Holdings = Record<string, number>;

export interface StockBalances {
  cash: number;
  stocks: Holdings;
}

interface BalancesResponse {
  balance: StockBalances;
}

export async function fetchMarketStatus(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/stocks/market-status`);
  if (!res.ok) throw new Error("Failed to check market status");
  const data = await res.json();
  return data.isOpen;
}

export async function fetchStockPrice(symbol: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/stocks/price?symbol=${symbol}`);
  if (!res.ok) throw new Error("Failed to fetch stock price");
  const data = await res.json();
  return data.price;
}

export async function fetchStockHistory(symbol: string, resolution: string): Promise<StockHistory> {
  const res = await fetch(`${BASE_URL}/api/stocks/history?symbol=${symbol}&resolution=${resolution}`);
  if (!res.ok) throw new Error(`Failed to fetch history for ${symbol}`);
  const data = await res.json();
  return data;
}

export async function fetchStockBalances(): Promise<StockBalances> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();

  const res = await fetch(`${BASE_URL}/api/stocks/balance`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || "Failed to fetch stock balances");
  }

  const data: BalancesResponse = await res.json();
  return data.balance;
}

export async function fetchStockHistoryDb(
  symbol: string,
  resolution: string,
  opts?: { start?: number; end?: number; limit?: number }
) {
  const params = new URLSearchParams({ symbol, resolution });
  if (opts?.start != null) params.set("start", String(opts.start));
  if (opts?.end != null)   params.set("end",   String(opts.end));
  if (opts?.limit != null) params.set("limit", String(opts.limit));

  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/stocks/history/db?${params.toString()}`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || data?.detail || "DB history fetch failed");
  }
  return res.json() as Promise<StockHistory>;
}