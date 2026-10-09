import type { IndicatorFn } from './indicator-types';
import { closes, computeRSI, result, sma } from './indicator-math';

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

export const macdIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('macd', tf, lookback, 0, null);
  const vals = closes(candles);
  const needed = lookback + 9;
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
