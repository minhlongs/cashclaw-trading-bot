// Regime feature helpers — pure, causal mathematical functions
// Extracted from features.ts so both modules stay under the 150 LOC target.

import type { Candle } from '@/forest/backtest/ohlcv';

/**
 * Compute logarithmic returns from close prices.
 * Returns array of length n-1.
 */
export function logReturns(closes: number[]): number[] {
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
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute mean of a numeric array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Compute True Range for each candle.
 */
export function trueRanges(candles: Candle[]): number[] {
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
export function linearSlope(values: number[]): number {
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
export function zScore(value: number, reference: number[]): number {
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
export function adxLike(candles: Candle[], period: number): number {
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
