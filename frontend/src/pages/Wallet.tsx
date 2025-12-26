import { Wallet, DollarSign, Building2, Bitcoin, Globe2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { auth } from "../firebase/firebaseConfig";
import { onIdTokenChanged } from "firebase/auth";

// API helpers + name lookups
import { fetchStockPrice } from "../api/stocks";
import { fetchCryptoPrice } from "../api/crypto";
import { fetchForexPrice } from "../api/forex";
import { getStockDisplayName } from "../config/stocksConfig";
import { getCryptoDisplayName } from "../config/cryptoConfig";
import { getForexDisplayName } from "../config/forexConfig";

interface Balance {
  cash: number;
  stocks: Record<string, number>;
  crypto: Record<string, number>;
  forex: Record<string, number>;
}

interface Holding {
  asset: string;
  fullName: string;
  allocation: number; // derived at render
  balance: number;
  price: number;
  change?: number;
  type: "cash" | "stocks" | "crypto" | "forex";
}

interface HoldingRowProps extends Holding {}

interface HoldingsTableProps {
  title?: string;
  holdings: Holding[];
  showHeaders?: boolean;
}

const getAssetIcon = (type: string) => {
  if (type === "cash") return DollarSign;
  if (type === "stocks") return Building2;
  if (type === "crypto") return Bitcoin;
  if (type === "forex") return Globe2;
  return DollarSign;
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "cash": return "text-yellow-700";
    case "stocks": return "text-green-700";
    case "crypto": return "text-yellow-600";
    case "forex": return "text-indigo-500";
    default: return "text-gray-300";
  }
};

const HoldingsRow = ({
  asset,
  fullName,
  allocation,
  balance,
  price,
  type
}: HoldingRowProps) => {
  const Icon = getAssetIcon(type);
  const typeColor = getTypeColor(type);
  const totalValue = balance * price;

  return (
    <div className="grid items-center grid-cols-[2fr_1fr_1fr] gap-4 py-4 px-6 border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted/20 ${typeColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="font-medium text-gray-200">{asset}</div>
          <div className="text-sm text-gray-300">{fullName}</div>
        </div>
      </div>

      <div className="flex items-center">
        <div className="text-sm">
          <div className="font-medium text-gray-200">
            {balance.toLocaleString(undefined, { 
              minimumFractionDigits: balance < 1 ? 6 : 2,
              maximumFractionDigits: balance < 1 ? 6 : 2
            })}
          </div>
          <div className="text-xs text-gray-300">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
      
      <div className="flex items-center">
        <div className="text-gray-200">
          <div className="font-medium text-gray-200">{allocation.toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );
};

const typeBgColor = (type: string) => {
  switch (type) {
    case "cash": return "bg-yellow-700";
    case "stocks": return "bg-green-700";
    case "crypto": return "bg-yellow-600";
    case "forex": return "bg-indigo-500";
    default: return "bg-gray-600";
  }
};

const HoldingsTable = ({ title, holdings, showHeaders = true }: HoldingsTableProps) => {
  if (holdings.length === 0) return null;

  const type = holdings[0]?.type ?? "cash";
  const headerColor = typeBgColor(type);

  return (
    <div className="bg-gray-800 border border-gray-400 rounded-lg overflow-hidden">
      {title && (
        <div className={`px-4 py-2 ${headerColor}`}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
            {title}
          </h2>
        </div>
      )}
      
      {showHeaders && (
        <div className="grid items-center grid-cols-[2fr_1fr_1fr] gap-4 py-2 px-6 border-b border-border text-xs font-medium text-gray-400">
          <div>Asset</div>
          <div>Balance</div>
          <div>Allocation</div>
        </div>
      )}
      
      <div>
        {holdings.map((holding, index) => (
          <HoldingsRow
            key={`${holding.type}-${holding.asset}-${index}`}
            {...holding}
          />
        ))}
      </div>
    </div>
  );
};

// unwrap API price safely
const asPrice = (x: any): number =>
  typeof x === "number" ? x : (x?.price ?? x?.c ?? 0);


const Holdings = () => {
  const [cashHoldings, setCashHoldings] = useState<Holding[]>([]);
  const [stockHoldings, setStockHoldings] = useState<Holding[]>([]);
  const [cryptoHoldings, setCryptoHoldings] = useState<Holding[]>([]);
  const [forexHoldings, setForexHoldings] = useState<Holding[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false); // <-- know when Firebase finished hydrating

  // compute totals from base holdings (no allocation in state)
  const totals = useMemo(() => {
    const sum = (arr: Holding[]) => arr.reduce((s, h) => s + h.price * h.balance, 0);
    const cash = sum(cashHoldings);
    const stocks = sum(stockHoldings);
    const crypto = sum(cryptoHoldings);
    const forex = sum(forexHoldings);
    const total = cash + stocks + crypto + forex;
    return { cash, stocks, crypto, forex, total };
  }, [cashHoldings, stockHoldings, cryptoHoldings, forexHoldings]);

  // derive allocations at render time
  const withAlloc = (arr: Holding[]) =>
    arr.map(h => ({
      ...h,
      allocation: totals.total > 0 ? (h.price * h.balance / totals.total) * 100 : 0
    }));

  const cashWithAlloc   = useMemo(() => withAlloc(cashHoldings),   [cashHoldings, totals.total]);
  const stocksWithAlloc = useMemo(() => withAlloc(stockHoldings),  [stockHoldings, totals.total]);
  const cryptoWithAlloc = useMemo(() => withAlloc(cryptoHoldings), [cryptoHoldings, totals.total]);
  const forexWithAlloc  = useMemo(() => withAlloc(forexHoldings),  [forexHoldings, totals.total]);

  useEffect(() => {
    const ac = new AbortController();

    // Wait for Firebase to resolve the current user before fetching
    const unsub = onIdTokenChanged(auth, async (user) => {
      setAuthReady(true);
      if (!user) {
        // only show this after authReady so there’s no flicker on reload
        setErr("Not signed in.");
        setCashHoldings([]);
        setStockHoldings([]);
        setCryptoHoldings([]);
        setForexHoldings([]);
        setLoading(false);
        return;
      }

      try {
        setErr(null);
        setLoading(true);

        const idToken = await user.getIdToken();

        // 1) balance
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/balance`, {
          headers: { Authorization: `Bearer ${idToken}` },
          signal: ac.signal
        });
        if (!res.ok) throw new Error("Failed to fetch balance");
        const data: Balance = await res.json();

        // 2) cash
        const cash: Holding = {
          asset: "USD",
          fullName: "US Dollar",
          allocation: 0, // derived later
          balance: data.cash ?? 0,
          price: 1,
          type: "cash"
        };

        // 3) stocks
        const stockSymbols = Object.keys(data.stocks || {});
        const stockPrices = await Promise.all(
          stockSymbols.map(async (sym) => {
            try {
              const p = await fetchStockPrice(sym);
              return [sym, asPrice(p)] as const;
            } catch {
              return [sym, 0] as const;
            }
          })
        );
        const stockPriceMap = Object.fromEntries(stockPrices);
        const stocks: Holding[] = stockSymbols.map((sym) => ({
          asset: sym,
          fullName: getStockDisplayName(sym),
          allocation: 0,
          balance: data.stocks[sym] ?? 0,
          price: stockPriceMap[sym] ?? 0,
          type: "stocks"
        }));

        // 4) crypto
        const cryptoSymbols = Object.keys(data.crypto || {});
        const cryptoPrices = await Promise.all(
          cryptoSymbols.map(async (sym) => {
            try {
              const p = await fetchCryptoPrice(sym);
              return [sym, asPrice(p)] as const;
            } catch {
              return [sym, 0] as const;
            }
          })
        );
        const cryptoPriceMap = Object.fromEntries(cryptoPrices);
        const cryptos: Holding[] = cryptoSymbols.map((sym) => ({
          asset: sym,
          fullName: getCryptoDisplayName(sym),
          allocation: 0,
          balance: data.crypto[sym] ?? 0,
          price: cryptoPriceMap[sym] ?? 0,
          type: "crypto"
        }));

        // 5) forex (vs USD)
        const fxSymbols = Object.keys(data.forex || {});
        const fxPrices = await Promise.all(
          fxSymbols.map(async (ccy) => {
            try {
              const p = await fetchForexPrice(ccy);
              return [ccy, asPrice(p)] as const;
            } catch {
              return [ccy, 0] as const;
            }
          })
        );
        const fxPriceMap = Object.fromEntries(fxPrices);
        const forex: Holding[] = fxSymbols.map((ccy) => ({
          asset: ccy,
          fullName: getForexDisplayName(ccy),
          allocation: 0,
          balance: data.forex[ccy] ?? 0,
          price: fxPriceMap[ccy] ?? 0,
          type: "forex"
        }));

        if (ac.signal.aborted) return;

        // 6) set state (allocations are derived)
        setCashHoldings([cash]);
        setStockHoldings(stocks);
        setCryptoHoldings(cryptos);
        setForexHoldings(forex);
      } catch (e: any) {
        if (!ac.signal.aborted) {
          console.error(e);
          setErr(e?.message || "Failed to load portfolio.");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    });

    return () => {
      ac.abort();
      unsub();
    };
  }, []);

  const totalPortfolioValue = totals.total;

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
            Portfolio Dashboard
          </h1>
          <div className="flex items-center justify-center gap-4 text-gray-300">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              <span>Total Portfolio Value</span>
            </div>
            <div
              className={`font-bold ${loading ? "text-white text-3xl" : "text-emerald-600 text-2xl"}`}
            >
              {loading ? "Loading..." : `$${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            </div>
          </div>
          {/* Only show the sign-in error once auth is actually resolved */}
          {authReady && err && <div className="text-red-400 text-sm">{err}</div>}
        </div>

        {/* Holdings Tables */}
        <div className="space-y-6">
          <HoldingsTable title="Cash"   holdings={cashWithAlloc}   showHeaders={true} />
          {stocksWithAlloc.length > 0 && <HoldingsTable title="Stocks" holdings={stocksWithAlloc} showHeaders={false} />}
          {cryptoWithAlloc.length > 0 && <HoldingsTable title="Crypto" holdings={cryptoWithAlloc} showHeaders={false} />}
          {forexWithAlloc.length > 0 &&  <HoldingsTable title="Forex"  holdings={forexWithAlloc}  showHeaders={false} />}
        </div>
      </div>
    </div>
  );
};

export default Holdings;
