import { auth } from "../firebase/firebaseConfig";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export type ForexHoldings = Record<string, number>;

export interface ForexBalances {
  cash: number;
  forex: ForexHoldings;
}

interface BalancesResponse {
  balance: ForexBalances;
}

export interface ForexCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ForexHistory {
  symbol: string;
  resolution: string;
  history: ForexCandle[];
}

export async function fetchMarketStatus(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/forex/market-status`);
  if (!res.ok) throw new Error("Failed to check market status");
  const data = await res.json();
  return data.isOpen;
}

export async function fetchForexPrice(symbol: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/forex/price?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Failed to fetch ${symbol} price`);
  }
  const data = await res.json();
  return data.price as number;
}

export async function fetchForexHistory(symbol: string, resolution: string): Promise<ForexHistory> {
  const res = await fetch(`${BASE_URL}/api/forex/history?symbol=${symbol}&resolution=${resolution}`);
  if (!res.ok) throw new Error(`Failed to fetch history for ${symbol}`);
  const data = await res.json();
  return data;
}

export async function fetchForexBalances(): Promise<ForexBalances> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();

  const res = await fetch(`${BASE_URL}/api/forex/balance`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || "Failed to fetch forex balances");
  }

  const data: BalancesResponse = await res.json();
  return data.balance;
}