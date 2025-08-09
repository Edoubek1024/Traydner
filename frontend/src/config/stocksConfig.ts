export const STOCKS = [
  { symbol: "AAPL",  name: "Apple Inc." },
  { symbol: "ABNB",  name: "Airbnb Inc." },
  { symbol: "ADBE",  name: "Adobe Inc." },
  { symbol: "AMD",   name: "Advanced Micro Devices Inc." },
  { symbol: "AMZN",  name: "Amazon.com Inc." },
  { symbol: "BAC",   name: "Bank of America Corporation" },
  { symbol: "BABA",  name: "Alibaba Group Holding Limited" },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc. (Class B)" },
  { symbol: "CRM",   name: "Salesforce Inc." },
  { symbol: "CSCO",  name: "Cisco Systems Inc." },
  { symbol: "CVX",   name: "Chevron Corporation" },
  { symbol: "DIS",   name: "The Walt Disney Company" },
  { symbol: "F",     name: "Ford Motor Company" },
  { symbol: "GM",    name: "General Motors Company" },
  { symbol: "GOOGL", name: "Alphabet Inc. (Class A)" },
  { symbol: "HD",    name: "The Home Depot Inc." },
  { symbol: "INTC",  name: "Intel Corporation" },
  { symbol: "JPM",   name: "JPMorgan Chase & Co." },
  { symbol: "KO",    name: "The Coca-Cola Company" },
  { symbol: "LYFT",  name: "Lyft Inc." },
  { symbol: "MA",    name: "Mastercard Incorporated" },
  { symbol: "MCD",   name: "McDonald's Corporation" },
  { symbol: "META",  name: "Meta Platforms Inc." },
  { symbol: "MRK",   name: "Merck & Co. Inc." },
  { symbol: "MSFT",  name: "Microsoft Corporation" },
  { symbol: "NFLX",  name: "Netflix Inc." },
  { symbol: "NKE",   name: "Nike Inc." },
  { symbol: "NVDA",  name: "NVIDIA Corporation" },
  { symbol: "ORCL",  name: "Oracle Corporation" },
  { symbol: "PEP",   name: "PepsiCo Inc." },
  { symbol: "PFE",   name: "Pfizer Inc." },
  { symbol: "PLTR",  name: "Palantir Technologies Inc." },
  { symbol: "PYPL",  name: "PayPal Holdings Inc." },
  { symbol: "ROKU",  name: "Roku Inc." },
  { symbol: "SHOP",  name: "Shopify Inc." },
  { symbol: "SOFI",  name: "SoFi Technologies Inc." },
  { symbol: "SOUN",  name: "SoundHound AI Inc." },
  { symbol: "T",     name: "AT&T Inc." },
  { symbol: "TSLA",  name: "Tesla Inc." },
  { symbol: "UBER",  name: "Uber Technologies Inc." },
  { symbol: "UNH",   name: "UnitedHealth Group Incorporated" },
  { symbol: "V",     name: "Visa Inc." },
  { symbol: "WMT",   name: "Walmart Inc." },
  { symbol: "XOM",   name: "Exxon Mobil Corporation" },
  { symbol: "ZM",    name: "Zoom Video Communications Inc." }
] as const;

export type Ticker = typeof STOCKS[number]["symbol"];

export const SYMBOLS: Ticker[] = STOCKS.map(s => s.symbol);

export const DISPLAY_NAME: Record<Ticker, string> = STOCKS.reduce((acc, s) => {
  acc[s.symbol] = s.name;
  return acc;
}, {} as Record<Ticker, string>);

export function getStockDisplayName(symbol: string): string {
  return (DISPLAY_NAME as Record<string, string>)[symbol] ?? symbol;
}