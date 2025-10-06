export const FOREX = [
  { symbol: "EUR", name: "Euro" },
  { symbol: "JPY", name: "Japanese Yen" },
  { symbol: "GBP", name: "British Pound" },
  { symbol: "AUD", name: "Australian Dollar" },
  { symbol: "NZD", name: "New Zealand Dollar" },
  { symbol: "CNY", name: "Chinese Yuan" },
  { symbol: "HKD", name: "Hong Kong Dollar" },
  { symbol: "SGD", name: "Singapore Dollar" },
  { symbol: "INR", name: "Indian Rupee" },
  { symbol: "MXN", name: "Mexican Peso" },
  { symbol: "PHP", name: "Philippine Peso" },
  { symbol: "IDR", name: "Indonesian Rupiah" },
  { symbol: "THB", name: "Thai Baht" },
  { symbol: "MYR", name: "Malaysian Ringgit" },
  { symbol: "ZAR", name: "South African Rand" },
  { symbol: "RUB", name: "Russian Ruble" },
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