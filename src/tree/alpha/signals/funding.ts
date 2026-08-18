// Non-TA signal sources — funding rate, open interest, liquidation, basis.
// All Binance public endpoints (no auth required).
// Causal: at timestamp T only data available at or before T is used.

import type { Candle } from '@/forest/backtest/ohlcv';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FundingRatePoint {
  timestamp: number;
  symbol: string;
  fundingRate: number; // perpetual funding rate (e.g. 0.0001 = 0.01%)
  markPrice: number;
}

export interface OpenInterestPoint {
  timestamp: number;
  symbol: string;
  openInterest: number; // contract notional (raw, from Binance)
  notionalUsd: number | null; // null when the source endpoint has no price to convert with
}

export interface LiquidationPoint {
  timestamp: number;
  symbol: string;
  side: 'long' | 'short';
  price: number;
  quantity: number;
  notionalUsd: number;
}

export interface DerivativeFeatures {
  timestamp: number;
  fundingRate: number | null;
  fundingRateAvg8h: number | null;
  fundingRateSlope: number | null; // change over lookback
  openInterest: number | null;
  oiChange: number | null; // % change over lookback
  oiZScore: number | null;
  liquidationImbalance: number | null; // long - short notional
  liquidationZScore: number | null;
  basis: number | null; // (futures - spot) / spot
  basisZScore: number | null;
}

// ── Binance public endpoints ─────────────────────────────────────────────────

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
  })).sort((a, b) => a.timestamp - a.timestamp);
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

// ── Feature computation ──────────────────────────────────────────────────────

function rollingMean(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function rollingStd(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance);
}

/**
 * Compute derivative features aligned to candle timestamps.
 * Causal: only uses data with timestamp <= candle timestamp.
 */
// Per-feature computation. Each helper takes the already-causal slice of its
// source (timestamp <= t) plus the lookback window, and returns the fields for
// one DerivativeFeatures entry. Splitting out keeps the main loop flat and
// keeps each branch's complexity under the lint ceiling.
function fundingFields(
  funding: FundingRatePoint[],
  t: number,
): { fundingRate: number | null; fundingRateAvg8h: number | null; fundingRateSlope: number | null } {
  const hist = funding.filter(f => f.timestamp <= t).map(f => f.fundingRate);
  return {
    fundingRate: hist.length > 0 ? hist[hist.length - 1] : null,
    fundingRateAvg8h: rollingMean(hist, 3), // ~3 x 8h = 24h
    fundingRateSlope: hist.length >= 3 ? hist[hist.length - 1] - hist[hist.length - 3] : null,
  };
}

function oiFields(
  oi: OpenInterestPoint[],
  t: number,
  lookbackBars: number,
): { openInterest: number | null; oiChange: number | null; oiZScore: number | null } {
  // notionalUsd may be null when the source endpoint has no price to convert
  // with; drop nulls so they don't propagate NaN into oiChange / oiZScore.
  const hist = oi.filter(o => o.timestamp <= t && o.notionalUsd !== null).map(o => o.notionalUsd as number);
  return {
    openInterest: hist.length > 0 ? hist[hist.length - 1] : null,
    oiChange: hist.length >= 2
      ? (hist[hist.length - 1] - hist[hist.length - 2]) / hist[hist.length - 2]
      : null,
    oiZScore: hist.length >= lookbackBars
      ? (hist[hist.length - 1] - (rollingMean(hist, lookbackBars) ?? 0)) /
        (rollingStd(hist, lookbackBars) ?? 1)
      : null,
  };
}

function liquidationFields(
  liquidations: LiquidationPoint[],
  t: number,
  lookbackBars: number,
  candleIntervalMs: number,
): { liquidationImbalance: number; liquidationZScore: number | null } {
  // Window length is derived from the actual candle spacing, not a hardcoded
  // 4h assumption, so it stays correct for 1h / 4h / 1d bars alike.
  const windowStart = t - lookbackBars * candleIntervalMs;
  const liqWindow = liquidations.filter(l => l.timestamp >= windowStart && l.timestamp <= t);
  const longNotional = liqWindow.filter(l => l.side === 'long').reduce((s, l) => s + l.notionalUsd, 0);
  const shortNotional = liqWindow.filter(l => l.side === 'short').reduce((s, l) => s + l.notionalUsd, 0);
  const liquidationImbalance = longNotional - shortNotional;
  const allLiquidations = liqWindow.map(l => l.notionalUsd);
  const liqMean = rollingMean(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 0;
  const liqStd = rollingStd(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 1;
  // Standard z-score: deviation from the rolling mean, not from zero.
  return {
    liquidationImbalance,
    liquidationZScore: liqStd > 0 ? (liquidationImbalance - liqMean) / liqStd : null,
  };
}

function basisFields(
  premiumIndex: { timestamp: number; basis: number }[],
  t: number,
  lookbackBars: number,
): { basis: number | null; basisZScore: number | null } {
  // Basis = perpetual mark vs spot (premium index), not the funding rate.
  // The funding rate is a cost/decay signal; basis is the futures premium.
  const basisPoint = premiumIndex.find(p => p.timestamp <= t);
  const basis = basisPoint ? basisPoint.basis : null;
  const hist = premiumIndex.filter(p => p.timestamp <= t).map(p => p.basis);
  return {
    basis,
    basisZScore: basis !== null && hist.length >= lookbackBars
      ? (basis - (rollingMean(hist, lookbackBars) ?? 0)) /
        (rollingStd(hist, lookbackBars) ?? 1)
      : null,
  };
}

export function computeDerivativeFeatures(
  candles: Candle[],
  funding: FundingRatePoint[],
  oi: OpenInterestPoint[],
  liquidations: LiquidationPoint[],
  premiumIndex: { timestamp: number; basis: number }[] = [],
  lookbackBars = 20,
): DerivativeFeatures[] {
  const result: DerivativeFeatures[] = [];
  const candleIntervalMs = candles.length >= 2
    ? candles[1].timestamp - candles[0].timestamp
    : 4 * 3_600_000;

  for (const candle of candles) {
    const t = candle.timestamp;
    result.push({
      timestamp: t,
      ...fundingFields(funding, t),
      ...oiFields(oi, t, lookbackBars),
      ...liquidationFields(liquidations, t, lookbackBars, candleIntervalMs),
      ...basisFields(premiumIndex, t, lookbackBars),
    });
  }

  return result;
}