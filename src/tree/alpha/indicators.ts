// Pure, testable, causal indicator functions for alpha signal generation.
// All functions are deterministic: no side effects, no input mutation.

import type {
  IndicatorCandle,
  IndicatorFn,
  IndicatorRegistry,
  IndicatorResult,
} from './indicator-types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function result(
  name: string,
  timeframe: string,
  lookback: number,
  timestamp: number,
  value: IndicatorResult['value'],
): IndicatorResult {
  return { name, timeframe, lookback, causal: true, timestamp, value };
}

function closes(candles: readonly IndicatorCandle[]): number[] {
  return candles.map((c) => c.close);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function stdDev(values: number[], mean: number): number {
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── 1. SMA ────────────────────────────────────────────────────────────────────

const smaIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const values = closes(candles);
  const last = candles[candles.length - 1];
  if (!last) return result('sma', tf, lookback, 0, null);
  const value = sma(values, lookback);
  return result('sma', tf, lookback, last.timestamp, value);
};

// ── 2. EMA ────────────────────────────────────────────────────────────────────

const emaIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
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

// ── 3. RSI ────────────────────────────────────────────────────────────────────

const rsiIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('rsi', tf, lookback, 0, null);
  const needed = lookback + 1;
  if (candles.length < needed) return result('rsi', tf, lookback, last.timestamp, null);
  let gain = 0;
  let loss = 0;
  for (let i = candles.length - lookback; i < candles.length; i++) {
    const delta = candles[i].close - candles[i - 1].close;
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  const avgGain = gain / lookback;
  const avgLoss = loss / lookback;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return result('rsi', tf, lookback, last.timestamp, {
    rsi,
    overbought: rsi >= 70,
    oversold: rsi <= 30,
  });
};

// ── 4. ATR ────────────────────────────────────────────────────────────────────

const atrIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
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

// ── 5. Bollinger Bands ────────────────────────────────────────────────────────

const bollingerIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('bollinger', tf, lookback, 0, null);
  const vals = closes(candles).slice(-lookback);
  if (vals.length < lookback) return result('bollinger', tf, lookback, last.timestamp, null);
  const middle = vals.reduce((s, v) => s + v, 0) / lookback;
  const sd = stdDev(vals, middle);
  const upper = middle + 2 * sd;
  const lower = middle - 2 * sd;
  const bandwidth = middle !== 0 ? (upper - lower) / middle : 0;
  const percentB = upper !== lower ? (last.close - lower) / (upper - lower) : 0.5;
  return result('bollinger', tf, lookback, last.timestamp, {
    upper, middle, lower, bandwidth, percentB,
  });
};

// ── 6. MACD ───────────────────────────────────────────────────────────────────

const macdIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
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

// ── 7. Volume Z-Score ─────────────────────────────────────────────────────────

const volumeZScoreIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
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

// ── 8. Simple Returns ─────────────────────────────────────────────────────────

const returnsIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last || candles.length < 2) return result('returns', tf, lookback, 0, null);
  const prevIdx = candles.length - 1 - lookback;
  if (prevIdx < 0) return result('returns', tf, lookback, last.timestamp, null);
  const prevClose = candles[prevIdx].close;
  if (prevClose === 0) return result('returns', tf, lookback, last.timestamp, null);
  const ret = (last.close - prevClose) / prevClose;
  return result('returns', tf, lookback, last.timestamp, ret);
};

// ── 9. Log Returns ────────────────────────────────────────────────────────────

const logReturnsIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last || candles.length < 2) return result('log_returns', tf, lookback, 0, null);
  const prevIdx = candles.length - 1 - lookback;
  if (prevIdx < 0) return result('log_returns', tf, lookback, last.timestamp, null);
  const prevClose = candles[prevIdx].close;
  if (prevClose <= 0 || last.close <= 0) return result('log_returns', tf, lookback, last.timestamp, null);
  return result('log_returns', tf, lookback, last.timestamp, Math.log(last.close / prevClose));
};

// ── 10. Momentum ──────────────────────────────────────────────────────────────

const momentumIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('momentum', tf, lookback, 0, null);
  const prevIdx = candles.length - 1 - lookback;
  if (prevIdx < 0) return result('momentum', tf, lookback, last.timestamp, null);
  const prevClose = candles[prevIdx].close;
  return result('momentum', tf, lookback, last.timestamp, last.close - prevClose);
};

// ── 11. Realized Volatility ───────────────────────────────────────────────────

const realizedVolatilityIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
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

// ── 12. Distance from MA ──────────────────────────────────────────────────────

const distanceFromMAIndicator: IndicatorFn = (candles, lookback, tf = '1h') => {
  const last = candles[candles.length - 1];
  if (!last) return result('distance_from_ma', tf, lookback, 0, null);
  const values = closes(candles);
  const ma = sma(values, lookback);
  if (ma === null || ma === 0) return result('distance_from_ma', tf, lookback, last.timestamp, null);
  const dist = (last.close - ma) / ma;
  return result('distance_from_ma', tf, lookback, last.timestamp, dist);
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const indicators: IndicatorRegistry = {
  sma: smaIndicator,
  ema: emaIndicator,
  rsi: rsiIndicator,
  atr: atrIndicator,
  bollinger: bollingerIndicator,
  macd: macdIndicator,
  volume_zscore: volumeZScoreIndicator,
  returns: returnsIndicator,
  log_returns: logReturnsIndicator,
  momentum: momentumIndicator,
  realized_volatility: realizedVolatilityIndicator,
  distance_from_ma: distanceFromMAIndicator,
};
