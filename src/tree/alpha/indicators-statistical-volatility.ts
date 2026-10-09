import type { IndicatorFn } from './indicator-types';
import { closes, result, sma, stdDev } from './indicator-math';

export const volumeZScoreIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('volume_zscore', tf, lookback, 0, null);
  const volSlice = candles.slice(-lookback).map((c) => c.volume);
  if (volSlice.length < lookback) return result('volume_zscore', tf, lookback, last.timestamp, null);
  const mean = volSlice.reduce((s, v) => s + v, 0) / lookback;
  if (mean === 0) return result('volume_zscore', tf, lookback, last.timestamp, null);
  const sd = stdDev(volSlice, mean);
  if (sd === 0) return result('volume_zscore', tf, lookback, last.timestamp, 0);
  return result('volume_zscore', tf, lookback, last.timestamp, (last.volume - mean) / sd);
};

export const realizedVolatilityIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last || candles.length < lookback + 1) {
    return result('realized_volatility', tf, lookback, last?.timestamp ?? 0, null);
  }
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
  const ma = sma(closes(candles), lookback);
  if (ma === null || ma === 0) return result('distance_from_ma', tf, lookback, last.timestamp, null);
  return result('distance_from_ma', tf, lookback, last.timestamp, (last.close - ma) / ma);
};
