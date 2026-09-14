// Pure statistical indicators for alpha signal generation.
// Deterministic: no side effects, no input mutation, causal only.

import type { IndicatorFn } from './indicator-types';
import {
  closes,
  result,
  sma,
  stdDev,
} from './indicator-math';

export const volumeZScoreIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('volume_zscore', tf, lookback, 0, null);
  const volSlice = candles.slice(-lookback).map((c) => c.volume);
  if (volSlice.length < lookback) return result('volume_zscore', tf, lookback, last.timestamp, null);
  const mean = volSlice.reduce((s, v) => s + v, 0) / lookback;
  if (mean === 0) return result('volume_zscore', tf, lookback, last.timestamp, null);
  const sd = stdDev(volSlice, mean);
  if (sd === 0) return result('volume_zscore', tf, lookback, last.timestamp, 0);
  const z = (last.volume - mean) / sd;
  return result('volume_zscore', tf, lookback, last.timestamp, z);
};

export const returnsIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last || candles.length < 2) return result('returns', tf, lookback, 0, null);
  const prevIdx = candles.length - 1 - lookback;
  if (prevIdx < 0) return result('returns', tf, lookback, last.timestamp, null);
  const prevClose = candles[prevIdx].close;
  if (prevClose === 0) return result('returns', tf, lookback, last.timestamp, null);
  const ret = (last.close - prevClose) / prevClose;
  return result('returns', tf, lookback, last.timestamp, ret);
};

export const logReturnsIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last || candles.length < 2) return result('log_returns', tf, lookback, 0, null);
  const prevIdx = candles.length - 1 - lookback;
  if (prevIdx < 0) return result('log_returns', tf, lookback, last.timestamp, null);
  const prevClose = candles[prevIdx].close;
  if (prevClose <= 0 || last.close <= 0) return result('log_returns', tf, lookback, last.timestamp, null);
  return result('log_returns', tf, lookback, last.timestamp, Math.log(last.close / prevClose));
};

export const momentumIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('momentum', tf, lookback, 0, null);
  const prevIdx = candles.length - 1 - lookback;
  if (prevIdx < 0) return result('momentum', tf, lookback, last.timestamp, null);
  const prevClose = candles[prevIdx].close;
  return result('momentum', tf, lookback, last.timestamp, last.close - prevClose);
};

export const realizedVolatilityIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('realized_volatility', tf, lookback, 0, null);
  const needed = lookback + 1;
  if (candles.length < needed) return result('realized_volatility', tf, lookback, last.timestamp, null);
  const logRets: number[] = [];
  for (let i = candles.length - lookback; i < candles.length; i++) {
    if (candles[i].close > 0 && candles[i - 1].close > 0) {
      logRets.push(Math.log(candles[i].close / candles[i - 1].close));
    }
  }
  if (logRets.length < 2) return result('realized_volatility', tf, lookback, last.timestamp, null);
  const mean = logRets.reduce((s, v) => s + v, 0) / logRets.length;
  const variance = logRets.reduce((s, v) => s + (v - mean) ** 2, 0) / (logRets.length - 1);
  return result('realized_volatility', tf, lookback, last.timestamp, Math.sqrt(variance));
};

export const distanceFromMAIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('distance_from_ma', tf, lookback, 0, null);
  const values = closes(candles);
  const ma = sma(values, lookback);
  if (ma === null || ma === 0) return result('distance_from_ma', tf, lookback, last.timestamp, null);
  const dist = (last.close - ma) / ma;
  return result('distance_from_ma', tf, lookback, last.timestamp, dist);
};
