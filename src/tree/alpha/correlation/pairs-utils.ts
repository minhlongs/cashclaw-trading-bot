// Helpers for pairs trading — causal slicing and windowing utilities.

import type { IndicatorCandle } from '../indicator-types';

/** Causally slice candles strictly before asOfTime and take trailing lookback. */
export function causalSlice(
  candles: readonly IndicatorCandle[],
  asOfTime?: number,
  lookback?: number,
): readonly IndicatorCandle[] {
  const filtered = asOfTime !== undefined
    ? candles.filter((c) => c.timestamp < asOfTime)
    : candles;
  return lookback !== undefined ? filtered.slice(-lookback) : filtered;
}
