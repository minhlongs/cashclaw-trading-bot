// Regime feature extraction — pure, causal functions
// Each feature is computed from data available AT the timestamp (no future data)

import type { Candle } from '@/forest/backtest/ohlcv';
import { sma } from '@/tree/alpha/indicators';
import type { RegimeFeatures, RegimeConfig } from './types';

/**
 * Compute logarithmic returns from close prices.
 * Returns array of length n-1.
 */
function logReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return returns;
}

/**
 * Compute standard deviation of a numeric array.
 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute mean of a numeric array.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Compute True Range for each candle.
 */
function trueRanges(candles: Candle[]): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
    } else {
      const prev = candles[i - 1];
      const curr = candles[i];
      const hl = curr.high - curr.low;
      const hc = Math.abs(curr.high - prev.close);
      const lc = Math.abs(curr.low - prev.close);
      trs.push(Math.max(hl, hc, lc));
    }
  }
  return trs;
}

/**
 * Linear regression slope over an array of values.
 * Returns normalized slope (slope / mean of values).
 */
function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const avgY = sumY / n;

  // Normalize by mean to get relative slope
  return avgY !== 0 ? slope / avgY : 0;
}

/**
 * Z-score of a value against a reference array.
 */
function zScore(value: number, reference: number[]): number {
  if (reference.length < 2) return 0;
  const m = mean(reference);
  const s = stdDev(reference);
  if (s === 0) return 0;
  return (value - m) / s;
}

/**
 * ADX-like trend strength measure.
 * Simplified: compares directional movement to true range.
 * Returns value in 0–100 range.
 */
function adxLike(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;

  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const trs = trueRanges(candles);

  // Smooth over period
  const smoothedTR = mean(trs.slice(-period));
  const smoothedPlusDM = mean(plusDM.slice(-period));
  const smoothedMinusDM = mean(minusDM.slice(-period));

  if (smoothedTR === 0) return 0;

  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;
  const diSum = plusDI + minusDI;

  if (diSum === 0) return 0;

  const dx = (Math.abs(plusDI - minusDI) / diSum) * 100;
  return dx;
}

/**
 * Extract regime features from candle data.
 * Returns null if insufficient data.
 * All computations are causal — only uses data at or before the timestamp.
 */
export function extractRegimeFeatures(
  candles: Candle[],
  config: RegimeConfig,
): RegimeFeatures | null {
  if (candles.length < config.minCandles) {
    return null;
  }

  // Take last `lookback` candles for feature computation
  const window = candles.slice(-config.lookback);
  const closes = window.map((c) => c.close);
  const volumes = window.map((c) => c.volume);

  // 1. Realized volatility: std dev of log returns
  const returns = logReturns(closes);
  const realizedVol = stdDev(returns);

  // 2. ATR: average true range
  const trs = trueRanges(window);
  const atr = mean(trs);

  // 3. Trend strength: ADX-like measure
  const trendStrength = adxLike(window, Math.min(14, window.length - 1));

  // 4. MA slope: normalized slope of SMA
  const smaPeriod = Math.min(20, window.length);
  const smaValues: number[] = [];
  for (let i = smaPeriod; i <= closes.length; i++) {
    const value = sma(closes.slice(0, i), smaPeriod);
    if (value !== null) smaValues.push(value);
  }
  const maSlope = linearSlope(smaValues);

  // 5. Return dispersion: std of cross-candle returns
  const returnDispersion = stdDev(returns);

  // 6. Volume abnormality: z-score of last volume vs lookback mean
  const volumeAbnormality = zScore(volumes[volumes.length - 1], volumes.slice(0, -1));

  return {
    realizedVol,
    atr,
    trendStrength,
    maSlope,
    returnDispersion,
    volumeAbnormality,
  };
}
