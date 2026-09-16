// Regime feature extraction — pure, causal functions
// Each feature is computed from data available AT the timestamp (no future data)

import type { Candle } from '@/forest/backtest/ohlcv';
import { sma } from '@/tree/alpha/indicators';
import type { RegimeFeatures, RegimeConfig } from './types';
import {
  logReturns,
  stdDev,
  mean,
  trueRanges,
  linearSlope,
  zScore,
  adxLike,
} from './feature-helpers';

/**
 * Extract regime features from candle data.
 * Returns null if insufficient data.
 * All computations are causal — only uses data at or before the timestamp.
 *
 * `atIndex` defaults to the last candle. Passing an explicit index lets callers
 * extract features for a historical point; the result must then be invariant
 * to any candles that come after that index, which is what the leakage tests
 * rely on.
 */
export function extractRegimeFeatures(
  candles: Candle[],
  config: RegimeConfig,
  atIndex = candles.length - 1,
): RegimeFeatures | null {
  if (atIndex < 0 || atIndex >= candles.length) {
    return null;
  }
  // The window ending at atIndex must contain at least minCandles.
  if (atIndex + 1 < config.minCandles) {
    return null;
  }

  // Take the `lookback` candles ending at `atIndex`. Slicing at atIndex + 1 is
  // what makes this causal: candles after the index are never read.
  const window = candles.slice(Math.max(0, atIndex - config.lookback + 1), atIndex + 1);
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
