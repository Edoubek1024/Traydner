export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_BASE_URL}/healthz`,
      { cache: "no-store" }
    );
    return res.ok;
  } catch {
    return false;
  }
}
