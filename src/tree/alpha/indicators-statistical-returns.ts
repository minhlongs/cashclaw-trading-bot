import type { IndicatorFn } from './indicator-types';
import { result } from './indicator-math';

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
  return result('momentum', tf, lookback, last.timestamp, last.close - candles[prevIdx].close);
};
