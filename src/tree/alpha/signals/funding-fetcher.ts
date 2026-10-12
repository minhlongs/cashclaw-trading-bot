export const BINANCE_BASE = 'https://api.binance.com';

export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': 'trade-bot/1.0' } });
  if (!res.ok) throw new Error(`[${res.status}] ${url}`);
  return res.json();
}

export function cleanSymbol(symbol: string): string {
  return encodeURIComponent(symbol.replace('/', ''));
}
