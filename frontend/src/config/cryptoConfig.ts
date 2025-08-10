export const CRYPTOS = [
  { symbol: "BTC",  name: "Bitcoin" },
  { symbol: "ETH",  name: "Ethereum" },
  { symbol: "BNB",  name: "BNB" },
  { symbol: "SOL",  name: "Solana" },
  { symbol: "XRP",  name: "XRP" },
  { symbol: "ADA",  name: "Cardano" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "TRX",  name: "TRON" },
  { symbol: "DOT",  name: "Polkadot" },
  { symbol: "MATIC",name: "Polygon" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "LTC",  name: "Litecoin" },
  { symbol: "SHIB", name: "Shiba Inu" },
  { symbol: "BCH",  name: "Bitcoin Cash" },
  { symbol: "XLM",  name: "Stellar" },
  { symbol: "UNI",  name: "Uniswap" },
  { symbol: "ATOM", name: "Cosmos" },
  { symbol: "ETC",  name: "Ethereum Classic" },
  { symbol: "APT",  name: "Aptos" }
] as const;

export type CryptoTicker = typeof CRYPTOS[number]["symbol"];

export const CRYPTO_SYMBOLS: CryptoTicker[] = CRYPTOS.map(c => c.symbol);

export const DISPLAY_NAME: Record<CryptoTicker, string> = CRYPTOS.reduce((acc, c) => {
  acc[c.symbol] = c.name;
  return acc;
}, {} as Record<CryptoTicker, string>);

export function getCryptoDisplayName(symbol: string): string {
  return (DISPLAY_NAME as Record<string, string>)[symbol] ?? symbol;
}