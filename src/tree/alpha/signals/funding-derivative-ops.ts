import type { OpenInterestPoint, LiquidationPoint } from './funding-types';
import { BINANCE_BASE, fetchJson, cleanSymbol } from './funding-fetcher';

export async function fetchOpenInterestHistory(symbol: string, period: '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d', startTime?: number, endTime?: number, limit = 30): Promise<OpenInterestPoint[]> {
  const params = new URLSearchParams({ symbol: cleanSymbol(symbol), period, limit: String(limit) });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));
  const data = await fetchJson(`${BINANCE_BASE}/fapi/v1/openInterest/history?${params}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    timestamp: Number(r.timestamp), symbol, openInterest: Number(r.openInterest),
    notionalUsd: typeof r.price === 'number' ? Number(r.openInterest) * Number(r.price) : null,
  })).sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchLiquidations(symbol: string, startTime?: number, limit = 1000): Promise<LiquidationPoint[]> {
  const params = new URLSearchParams({ symbol: cleanSymbol(symbol), limit: String(limit) });
  if (startTime) params.set('startTime', String(startTime));
  const data = await fetchJson(`${BINANCE_BASE}/fapi/v1/liquidationOrders?${params}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    timestamp: Number(r.time), symbol,
    side: (String(r.side).toUpperCase() === 'BUY' ? 'short' : 'long') as 'long' | 'short',
    price: Number(r.price), quantity: Number(r.qty), notionalUsd: Number(r.price) * Number(r.qty),
  })).sort((a, b) => a.timestamp - b.timestamp);
}
