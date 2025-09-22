export const FOREX = [
  { symbol: "EUR", name: "Euro" },
  { symbol: "GBP", name: "British Pound" },
  { symbol: "JPY", name: "Japanese Yen" },
  { symbol: "CHF", name: "Swiss Franc" },
  { symbol: "CAD", name: "Canadian Dollar" },
  { symbol: "AUD", name: "Australian Dollar" },
  { symbol: "NZD", name: "New Zealand Dollar" },
] as const;

export type ForexTicker = typeof FOREX[number]["symbol"];

export const FOREX_SYMBOLS: ForexTicker[] = FOREX.map(f => f.symbol);

export const DISPLAY_NAME: Record<ForexTicker, string> = FOREX.reduce((acc, f) => {
  acc[f.symbol] = f.name;
  return acc;
}, {} as Record<ForexTicker, string>);

export function getForexDisplayName(symbol: string): string {
  return (DISPLAY_NAME as Record<string, string>)[symbol] ?? symbol;
}