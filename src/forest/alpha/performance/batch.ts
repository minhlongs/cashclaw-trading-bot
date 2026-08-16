// Batch Indicator Computation — single-pass over all indicators,
// with cache-backed result reuse across walk-forward windows.

import type {
  IndicatorCandle,
  IndicatorRegistry,
  IndicatorValue,
} from '@/tree/alpha/indicator-types';
import type { IndicatorCache } from './cache';

/** Extract a single numeric value from an IndicatorValue for the given indicator name. */
function primaryValue(name: string, value: IndicatorValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    switch (name) {
      case 'macd':
        return (value as { macd: number }).macd;
      case 'bollinger':
        return (value as { middle: number }).middle;
      case 'rsi':
        return (value as { rsi: number }).rsi;
      default:
        return null;
    }
  }
  return null;
}

/**
 * Compute all indicators for the given candles in a single logical pass.
 * Each indicator is called once with the full candle array; results are
 * cached for reuse when the same (indicator, lookback, symbol, timeframe)
 * combination is requested again.
 *
 * @returns Map keyed by indicator name, each value a single-element array
 *          holding the latest computed numeric value (or null).
 */
export function batchComputeIndicators(
  candles: readonly IndicatorCandle[],
  indicatorRegistry: IndicatorRegistry,
  cache: IndicatorCache,
  symbol = 'unknown',
  timeframe = '1h',
): Map<string, (number | null)[]> {
  const output = new Map<string, (number | null)[]>();
  const LOOKBACK = 12;

  for (const [name, fn] of Object.entries(indicatorRegistry)) {
    const cachedValue = cache.get(name, LOOKBACK, symbol, timeframe);
    if (cachedValue !== undefined) {
      output.set(name, [primaryValue(name, cachedValue)]);
      continue;
    }

    const computed = fn(candles, LOOKBACK, timeframe);
    cache.set(name, LOOKBACK, symbol, timeframe, computed);

    const val = primaryValue(name, computed.value);
    output.set(name, [val]);
  }

  return output;
}