// Pure technical indicators for alpha signal generation.
// Deterministic: no side effects, no input mutation, causal only.

import type { IndicatorFn } from './indicator-types';
import { bollingerBands, closes, result, sma } from './indicator-math';
import { rsiIndicator, macdIndicator } from './indicators-momentum';

export { rsiIndicator, macdIndicator };

export const smaIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const values = closes(candles);
  const last = candles[candles.length - 1];
  if (!last) return result('sma', tf, lookback, 0, null);
  const value = sma(values, lookback);
  return result('sma', tf, lookback, last.timestamp, value);
};

export const emaIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('ema', tf, lookback, 0, null);
  if (candles.length < lookback) return result('ema', tf, lookback, last.timestamp, null);
  const k = 2 / (lookback + 1);
  let ema = sma(closes(candles), lookback)!;
  for (let i = lookback; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return result('ema', tf, lookback, last.timestamp, ema);
};

export const atrIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('atr', tf, lookback, 0, null);
  if (candles.length < lookback + 1) return result('atr', tf, lookback, last.timestamp, null);
  let atr = 0;
  for (let i = candles.length - lookback; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    atr += tr;
  }
  return result('atr', tf, lookback, last.timestamp, atr / lookback);
};

export const bollingerIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('bollinger', tf, lookback, 0, null);
  const bb = bollingerBands(closes(candles), lookback);
  if (!bb) return result('bollinger', tf, lookback, last.timestamp, null);
  return result('bollinger', tf, lookback, last.timestamp, bb);
};
