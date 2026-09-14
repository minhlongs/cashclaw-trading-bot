// Causal rolling statistical feature extractors for derivative signals.
// Causal: at timestamp T only data available at or before T is used.

import type { Candle } from '@/forest/backtest/ohlcv';
import type {
  FundingRatePoint,
  OpenInterestPoint,
  LiquidationPoint,
  DerivativeFeatures,
} from './funding-types';

export function rollingMean(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function rollingStd(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance);
}

export function fundingFields(
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

export function oiFields(
  oi: OpenInterestPoint[],
  t: number,
  lookbackBars: number,
): { openInterest: number | null; oiChange: number | null; oiZScore: number | null } {
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

export function liquidationFields(
  liquidations: LiquidationPoint[],
  t: number,
  lookbackBars: number,
  candleIntervalMs: number,
): { liquidationImbalance: number; liquidationZScore: number | null } {
  const windowStart = t - lookbackBars * candleIntervalMs;
  const liqWindow = liquidations.filter(l => l.timestamp >= windowStart && l.timestamp <= t);
  const longNotional = liqWindow.filter(l => l.side === 'long').reduce((s, l) => s + l.notionalUsd, 0);
  const shortNotional = liqWindow.filter(l => l.side === 'short').reduce((s, l) => s + l.notionalUsd, 0);
  const liquidationImbalance = longNotional - shortNotional;
  const allLiquidations = liqWindow.map(l => l.notionalUsd);
  const liqMean = rollingMean(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 0;
  const liqStd = rollingStd(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 1;
  return {
    liquidationImbalance,
    liquidationZScore: liqStd > 0 ? (liquidationImbalance - liqMean) / liqStd : null,
  };
}

export function basisFields(
  premiumIndex: { timestamp: number; basis: number }[],
  t: number,
  lookbackBars: number,
): { basis: number | null; basisZScore: number | null } {
  const eligible = premiumIndex.filter(p => p.timestamp <= t);
  const basisPoint = eligible.length > 0 ? eligible[eligible.length - 1] : undefined;
  const basis = basisPoint ? basisPoint.basis : null;
  const hist = eligible.map(p => p.basis);
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
