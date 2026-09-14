// Pure mathematical functions and OHLCV helpers for alpha indicators.
// All functions are deterministic: no side effects, no input mutation.

import type {
  IndicatorCandle,
  IndicatorResult,
} from './indicator-types';

const OHLCV_SOURCE: IndicatorResult['source'] = 'ohlcv';
const OHLCV_AVAILABILITY: IndicatorResult['availability'] = 'always';

export function result(
  name: string,
  timeframe: string,
  lookback: number,
  timestamp: number,
  value: IndicatorResult['value'],
): IndicatorResult {
  return {
    name,
    timeframe,
    lookback,
    causal: true,
    source: OHLCV_SOURCE,
    availability: OHLCV_AVAILABILITY,
    timestamp,
    value,
  };
}

export function closes(candles: readonly IndicatorCandle[]): number[] {
  return candles.map((c) => c.close);
}

export function sma(values: readonly number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

export function stdDev(values: readonly number[], mean: number): number {
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Wilder RSI from a raw price array. Returns null if insufficient data. */
export function computeRSI(
  values: readonly number[],
  period: number,
): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Bollinger Bands from a raw price array. Returns null if insufficient data. */
export function bollingerBands(
  values: readonly number[],
  period: number,
  stdDevMultiplier = 2,
): { upper: number; middle: number; lower: number; bandwidth: number; percentB: number } | null {
  if (values.length < period) return null;
  const window = values.slice(-period);
  const middle = window.reduce((s, v) => s + v, 0) / period;
  const sd = stdDev(window, middle);
  const upper = middle + stdDevMultiplier * sd;
  const lower = middle - stdDevMultiplier * sd;
  const bandwidth = middle !== 0 ? (upper - lower) / middle : 0;
  const lastVal = window[window.length - 1];
  const percentB = upper !== lower ? (lastVal - lower) / (upper - lower) : 0.5;
  return { upper, middle, lower, bandwidth, percentB };
}
