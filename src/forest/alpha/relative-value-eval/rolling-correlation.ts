// Rolling correlation diagnostic for relative-value evaluation seam.
// Pure, deterministic — DIAGNOSTIC ONLY, never used for sizing or order execution.
// Causality: each period's correlation uses only closes with timestamp STRICTLY BEFORE
// that period's timestamp.

import type { PairPanel, PairPeriodRecord } from '@/tree/alpha/relative-value';
import type { IndicatorCandle } from '@/tree/alpha/indicator-types';
import { computeRollingCorrelation } from '@/tree/alpha/correlation/compute';
import type { RelativeValueEvalConfig } from './types';

const DEFAULT_CORRELATION_MIN_OBS = 5;

/** Convert pair panel into IndicatorCandle arrays for correlation computation. */
function toIndicatorCandles(timestamps: readonly number[], closes: readonly number[]): IndicatorCandle[] {
  return timestamps.map((timestamp, i) => ({
    timestamp,
    open: closes[i]!,
    high: closes[i]!,
    low: closes[i]!,
    close: closes[i]!,
    volume: 0,
  }));
}

/**
 * Per-period rolling correlation between legA and legB closes using only
 * history strictly before each period's decision timestamp.
 * Returns undefined when config.correlationWindow is undefined.
 */
export function computeRealizedPairCorrelationSeries(
  panel: PairPanel,
  periods: readonly PairPeriodRecord[],
  config: RelativeValueEvalConfig,
): number[] | undefined {
  if (config.correlationWindow === undefined) return undefined;

  const window = config.correlationWindow;
  const minObs = Math.min(window, DEFAULT_CORRELATION_MIN_OBS);
  const candlesA = toIndicatorCandles(panel.timestamps, panel.closesA);
  const candlesB = toIndicatorCandles(panel.timestamps, panel.closesB);

  return periods.map((period) => {
    // Causal slice: only candles strictly before this period's decision timestamp
    let sliceEnd = 0;
    while (sliceEnd < panel.timestamps.length && panel.timestamps[sliceEnd]! < period.timestamp) {
      sliceEnd++;
    }

    if (sliceEnd < minObs) {
      return 0;
    }

    const start = Math.max(0, sliceEnd - window);
    const sliceA = candlesA.slice(start, sliceEnd);
    const sliceB = candlesB.slice(start, sliceEnd);

    const rolling = computeRollingCorrelation(sliceA, sliceB, sliceA.length, sliceA.length);
    return rolling.length > 0 ? (rolling[0] ?? 0) : 0;
  });
}
