import { auth } from "../firebase/firebaseConfig";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;


export type CryptoHoldings = Record<string, number>;

export interface CryptoBalances {
  cash: number;
  crypto: CryptoHoldings;
}

interface CryptoBalancesResponse {
  balance: CryptoBalances;
}

export interface CryptoCandle {
  timestamp: number; // seconds since epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;    // crypto volumes can be fractional
}

export interface CryptoHistory {
  symbol: string;
  resolution: string;
  history: CryptoCandle[];
}

type HistoryOpts = {
  start?: number; // unix seconds
  end?: number;   // unix seconds
  limit?: number; // 1..1000 (Binance cap)
};

export async function fetchCryptoBalances(): Promise<CryptoBalances> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();

  const res = await fetch(`${BASE_URL}/api/crypto/balance`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || "Failed to fetch crypto balances");
  }

  const data: CryptoBalancesResponse = await res.json();
  return data.balance;
}

export async function fetchCryptoPrice(symbol: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/crypto/price?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Failed to fetch ${symbol} price`);
  }
  const data = await res.json();
  return data.price as number;
}

export async function fetchCryptoHistory(
  symbol: string,
  resolution: string = "D",
  opts: HistoryOpts = {}
): Promise<CryptoHistory> {
  const params = new URLSearchParams({
    symbol,
    resolution,
  });
  if (opts.start != null) params.set("start", String(opts.start));
  if (opts.end != null) params.set("end", String(opts.end));
  if (opts.limit != null) params.set("limit", String(opts.limit));

  const res = await fetch(`${BASE_URL}/api/crypto/history?${params.toString()}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Failed to fetch ${symbol} history`);
  }

  const data: CryptoHistory = await res.json();
  return data;
}