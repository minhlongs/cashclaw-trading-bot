import type { FundingRatePoint } from './funding-types';
import { BINANCE_BASE, fetchJson, cleanSymbol } from './funding-fetcher';

export async function fetchFundingRate(symbol: string, startTime?: number, endTime?: number, limit = 1000): Promise<FundingRatePoint[]> {
  const params = new URLSearchParams({ symbol: cleanSymbol(symbol), limit: String(limit) });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));
  const data = await fetchJson(`${BINANCE_BASE}/fapi/v1/fundingRate?${params}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    timestamp: Number(r.timestamp),
    symbol,
    fundingRate: Number(r.fundingRate),
    markPrice: Number(r.markPrice),
  })).sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchPremiumIndex(symbol: string, startTime?: number, endTime?: number): Promise<{ timestamp: number; basis: number }[]> {
  const params = new URLSearchParams({ symbol: cleanSymbol(symbol) });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));
  const data = await fetchJson(`${BINANCE_BASE}/fapi/v1/premiumIndex?${params}`);
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map(d => ({
    timestamp: Number(d.time),
    basis: (Number(d.markPrice) - Number(d.indexPrice)) / Number(d.indexPrice),
  })).sort((a, b) => a.timestamp - b.timestamp);
}
