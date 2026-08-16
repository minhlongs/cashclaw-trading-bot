// Correlation, spread statistics, and rolling-window functions for pairs trading.

import type { IndicatorCandle } from '../indicator-types';
import { mean, stddev, olsResiduals } from './math-helpers';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract closing prices from an array of candles. */
function closes(candles: readonly IndicatorCandle[]): number[] {
  return candles.map((c) => c.close);
}

// ── Pearson Correlation ───────────────────────────────────────────────────────

/** Compute the Pearson correlation coefficient between two equal-length arrays. */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/** Pearson correlation over aligned candle closes within the lookback window. */
export function computePairCorrelation(
  candles1: readonly IndicatorCandle[],
  candles2: readonly IndicatorCandle[],
  lookback: number,
): number {
  const s1 = closes(candles1).slice(-lookback);
  const s2 = closes(candles2).slice(-lookback);
  return pearsonCorrelation(s1, s2);
}

/**
 * Rolling correlation series over two candle arrays.
 * Each output element is the Pearson correlation of the preceding `window` closes.
 */
export function computeRollingCorrelation(
  candles1: readonly IndicatorCandle[],
  candles2: readonly IndicatorCandle[],
  lookback: number,
  window: number,
): number[] {
  const s1 = closes(candles1).slice(-lookback);
  const s2 = closes(candles2).slice(-lookback);
  const minLen = Math.min(s1.length, s2.length);
  const result: number[] = [];

  for (let i = window; i <= minLen; i++) {
    const slice1 = s1.slice(i - window, i);
    const slice2 = s2.slice(i - window, i);
    result.push(pearsonCorrelation(slice1, slice2));
  }
  return result;
}

// ── Spread Statistics ─────────────────────────────────────────────────────────

/**
 * OLS spread statistics: fit y = beta * x + alpha, return residuals' mean, std, z-score.
 * Uses closes within the lookback window, aligned by timestamp.
 */
export function computeSpreadStatistics(
  candles1: readonly IndicatorCandle[],
  candles2: readonly IndicatorCandle[],
  lookback: number,
): { spreadMean: number; spreadStd: number; zScore: number; halfLife: number } {
  const s1 = closes(candles1).slice(-lookback);
  const s2 = closes(candles2).slice(-lookback);
  const n = Math.min(s1.length, s2.length);
  if (n < 3) return { spreadMean: 0, spreadStd: 0, zScore: 0, halfLife: Infinity };

  const residuals = olsResiduals(s1, s2);
  const spreadMean = mean(residuals);
  const spreadStd = stddev(residuals);
  const zScore = spreadStd === 0
    ? 0
    : (residuals[residuals.length - 1] - spreadMean) / spreadStd;

  const halfLife = computeHalfLife(residuals);
  return { spreadMean, spreadStd, zScore, halfLife };
}

// ── Internal ──────────────────────────────────────────────────────────────────

/** Estimate half-life of mean reversion via OLS: spread[t] = phi * spread[t-1] + c. */
function computeHalfLife(residuals: number[]): number {
  if (residuals.length < 3) return Infinity;
  const lag = residuals.slice(0, -1);
  const curr = residuals.slice(1);
  const mLag = mean(lag);
  const mCurr = mean(curr);
  let ssXY = 0;
  let ssXX = 0;
  for (let i = 0; i < lag.length; i++) {
    ssXY += (lag[i] - mLag) * (curr[i] - mCurr);
    ssXX += (lag[i] - mLag) ** 2;
  }
  const phi = ssXX === 0 ? 0 : ssXY / ssXX;
  if (phi <= 0 || phi >= 1) return Infinity;
  return -Math.log(2) / Math.log(phi);
}
