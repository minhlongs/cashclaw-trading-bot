// Pure technical indicators for alpha signal generation.
// Deterministic: no side effects, no input mutation, causal only.

import type { IndicatorFn } from './indicator-types';
import {
  bollingerBands,
  closes,
  computeRSI,
  result,
  sma,
} from './indicator-math';

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
  const start = lookback;
  for (let i = start; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return result('ema', tf, lookback, last.timestamp, ema);
};

export const rsiIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('rsi', tf, lookback, 0, null);
  const needed = lookback + 1;
  if (candles.length < needed) return result('rsi', tf, lookback, last.timestamp, null);
  const rsi = computeRSI(closes(candles), lookback);
  if (rsi === null) return result('rsi', tf, lookback, last.timestamp, null);
  return result('rsi', tf, lookback, last.timestamp, {
    rsi,
    overbought: rsi >= 70,
    oversold: rsi <= 30,
  });
};

export const atrIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('atr', tf, lookback, 0, null);
  if (candles.length < lookback + 1) return result('atr', tf, lookback, last.timestamp, null);
  let atr = 0;
  for (let i = candles.length - lookback; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
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

export const macdIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('macd', tf, lookback, 0, null);
  const vals = closes(candles);
  const needed = lookback + 9; // 9-period signal EMA needs extra data
  if (vals.length < needed) return result('macd', tf, lookback, last.timestamp, null);
  const kFast = 2 / (12 + 1);
  const kSlow = 2 / (26 + 1);
  const kSig = 2 / (9 + 1);
  let ema12 = sma(vals.slice(0, 12), 12)!;
  let ema26 = sma(vals.slice(0, 26), 26)!;
  const macdLine: number[] = [];
  for (let i = 26; i < vals.length; i++) {
    ema12 = vals[i] * kFast + ema12 * (1 - kFast);
    ema26 = vals[i] * kSlow + ema26 * (1 - kSlow);
    macdLine.push(ema12 - ema26);
  }
  if (macdLine.length < 9) return result('macd', tf, lookback, last.timestamp, null);
  let signal = sma(macdLine.slice(0, 9), 9)!;
  for (let i = 9; i < macdLine.length; i++) {
    signal = macdLine[i] * kSig + signal * (1 - kSig);
  }
  const macd = macdLine[macdLine.length - 1];
  return result('macd', tf, lookback, last.timestamp, {
    macd,
    signal,
    histogram: macd - signal,
  });
};
