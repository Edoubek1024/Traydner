const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function fetchStockPrice(symbol: string): Promise<number> {
    const res = await fetch(`${BASE_URL}/api/price?symbol=${symbol}`);
    if (!res.ok) throw new Error("Failed to fetch stock price");
    const data = await res.json();
    return data.price;
}
