// Binance public derivative API endpoints (funding rate, open interest, liquidation, premium index).
// All Binance public endpoints (no auth required).

import type {
  FundingRatePoint,
  OpenInterestPoint,
  LiquidationPoint,
} from './funding-types';

const BASE = 'https://api.binance.com';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': 'trade-bot/1.0' } });
  if (!res.ok) throw new Error(`[${res.status}] ${url}`);
  return res.json();
}

/**
 * Fetch perpetual funding rate history.
 * Endpoint: /fapi/v1/fundingRate — public, no auth.
 * Returns up to 1000 most recent records.
 */
export async function fetchFundingRate(
  symbol: string,
  startTime?: number,
  endTime?: number,
  limit = 1000,
): Promise<FundingRatePoint[]> {
  const s = encodeURIComponent(symbol.replace('/', ''));
  const params = new URLSearchParams({ symbol: s, limit: String(limit) });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));
  const data = await fetchJson(`${BASE}/fapi/v1/fundingRate?${params}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    timestamp: Number(r.timestamp),
    symbol,
    fundingRate: Number(r.fundingRate),
    markPrice: Number(r.markPrice),
  })).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch historical open interest.
 * Endpoint: /fapi/v1/openInterest/history — public, no auth.
 * Returns up to 30 most recent records.
 */
export async function fetchOpenInterestHistory(
  symbol: string,
  period: '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d',
  startTime?: number,
  endTime?: number,
  limit = 30,
): Promise<OpenInterestPoint[]> {
  const s = encodeURIComponent(symbol.replace('/', ''));
  const params = new URLSearchParams({ symbol: s, period, limit: String(limit) });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));
  const data = await fetchJson(`${BASE}/fapi/v1/openInterest/history?${params}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    timestamp: Number(r.timestamp),
    symbol,
    openInterest: Number(r.openInterest),
    notionalUsd: typeof r.price === 'number' ? Number(r.openInterest) * Number(r.price) : null,
  })).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch liquidation orders (recent only — endpoint returns last ~500).
 * Endpoint: /fapi/v1/liquidationOrders — public, no auth.
 */
export async function fetchLiquidations(
  symbol: string,
  startTime?: number,
  limit = 1000,
): Promise<LiquidationPoint[]> {
  const s = encodeURIComponent(symbol.replace('/', ''));
  const params = new URLSearchParams({ symbol: s, limit: String(limit) });
  if (startTime) params.set('startTime', String(startTime));
  const data = await fetchJson(`${BASE}/fapi/v1/liquidationOrders?${params}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    timestamp: Number(r.time),
    symbol,
    side: (String(r.side).toUpperCase() === 'BUY' ? 'short' : 'long') as 'long' | 'short',
    price: Number(r.price),
    quantity: Number(r.qty),
    notionalUsd: Number(r.price) * Number(r.qty),
  })).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch premium index history (perpetual mark vs spot).
 * Endpoint: /fapi/v1/premiumIndex — public, no auth.
 * Returns an array so basis can be z-scored over a lookback window.
 */
export async function fetchPremiumIndex(
  symbol: string,
  startTime?: number,
  endTime?: number,
): Promise<{ timestamp: number; basis: number }[]> {
  const s = encodeURIComponent(symbol.replace('/', ''));
  const params = new URLSearchParams({ symbol: s });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));
  const data = await fetchJson(`${BASE}/fapi/v1/premiumIndex?${params}`);
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map(d => ({
      timestamp: Number(d.time),
      basis: (Number(d.markPrice) - Number(d.indexPrice)) / Number(d.indexPrice),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
