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
  openInterest: number; // contract notional
  notionalUsd: number;
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
    notionalUsd: Number(r.openInterest) * Number(r.price ?? 0),
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
 * Fetch premium index (perpetual mark vs spot).
 * Endpoint: /fapi/v1/premiumIndex — public, no auth.
 */
export async function fetchPremiumIndex(symbol: string): Promise<{ timestamp: number; basis: number } | null> {
  const s = encodeURIComponent(symbol.replace('/', ''));
  const data = await fetchJson(`${BASE}/fapi/v1/premiumIndex?symbol=${s}`);
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  return {
    timestamp: Number(d.time),
    basis: (Number(d.markPrice) - Number(d.indexPrice)) / Number(d.indexPrice),
  };
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
export function computeDerivativeFeatures(
  candles: Candle[],
  funding: FundingRatePoint[],
  oi: OpenInterestPoint[],
  liquidations: LiquidationPoint[],
  lookbackBars = 20,
): DerivativeFeatures[] {
  const result: DerivativeFeatures[] = [];

  for (const candle of candles) {
    const t = candle.timestamp;

    // Funding rate at or before this candle
    const histFunding = funding
      .filter(f => f.timestamp <= t)
      .map(f => f.fundingRate);
    const fundingRate = histFunding.length > 0 ? histFunding[histFunding.length - 1] : null;
    const fundingRateAvg8h = rollingMean(histFunding, 3); // ~3 x 8h = 24h
    const fundingRateSlope = histFunding.length >= 3
      ? histFunding[histFunding.length - 1] - histFunding[histFunding.length - 3]
      : null;

    // Open interest at or before this candle
    const histOI = oi.filter(o => o.timestamp <= t).map(o => o.notionalUsd);
    const oiChange = histOI.length >= 2
      ? (histOI[histOI.length - 1] - histOI[histOI.length - 2]) / histOI[histOI.length - 2]
      : null;
    const oiZScore = histOI.length >= lookbackBars
      ? (histOI[histOI.length - 1] - (rollingMean(histOI, lookbackBars) ?? 0)) /
        (rollingStd(histOI, lookbackBars) ?? 1)
      : null;

    // Liquidations in lookback window
    const windowStart = t - lookbackBars * 4 * 3600_000; // ~4h per bar
    const liqWindow = liquidations.filter(l => l.timestamp >= windowStart && l.timestamp <= t);
    const longNotional = liqWindow.filter(l => l.side === 'long').reduce((s, l) => s + l.notionalUsd, 0);
    const shortNotional = liqWindow.filter(l => l.side === 'short').reduce((s, l) => s + l.notionalUsd, 0);
    const liquidationImbalance = longNotional - shortNotional;
    const allLiquidations = liqWindow.map(l => l.notionalUsd);
    const liqMean = rollingMean(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 0;
    const liqStd = rollingStd(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 1;
    const liquidationZScore = liqStd > 0 ? liquidationImbalance / liqStd : null;

    // Basis
    const basisPoint = funding.find(f => f.timestamp <= t);
    const basis = basisPoint ? basisPoint.fundingRate : null;
    const basisZScore = basis !== null && histFunding.length >= lookbackBars
      ? (basis - (rollingMean(histFunding, lookbackBars) ?? 0)) /
        (rollingStd(histFunding, lookbackBars) ?? 1)
      : null;

    result.push({
      timestamp: t,
      fundingRate,
      fundingRateAvg8h,
      fundingRateSlope,
      openInterest: histOI.length > 0 ? histOI[histOI.length - 1] : null,
      oiChange,
      oiZScore,
      liquidationImbalance,
      liquidationZScore,
      basis,
      basisZScore,
    });
  }

  return result;
}