// Pair selection helpers for universe validation, diagnostics, and panel extraction.

import { pearsonCorrelation, computeSpreadStatistics } from '../correlation/compute';
import { testCointegration } from '../correlation/adf';
import type { IndicatorCandle } from '../indicator-types';
import type { PairPanel } from './types';
import type { UniversePanel, PairSelectionDiagnostics } from './pair-selection-types';

export function candles(timestamps: readonly number[], closes: readonly number[]): IndicatorCandle[] {
  return timestamps.map((t, i) => ({
    timestamp: t, open: closes[i]!, high: closes[i]!, low: closes[i]!, close: closes[i]!, volume: 0,
  }));
}

export function assertUniverse(universe: UniversePanel): void {
  if (universe.symbols.length !== universe.closes.length) {
    throw new Error('selectPairs: symbols.length !== closes.length');
  }
  for (let s = 0; s < universe.closes.length; s++) {
    if (universe.closes[s]!.length !== universe.timestamps.length) {
      throw new Error(`selectPairs: closes[${s}] length differs from timestamps`);
    }
  }
  for (let i = 1; i < universe.timestamps.length; i++) {
    if (universe.timestamps[i]! <= universe.timestamps[i - 1]!) {
      throw new Error('selectPairs: timestamps must be strictly increasing');
    }
  }
}

/** PairPanel view of two universe rows (reuses pair-level primitives). */
export function pairPanel(universe: UniversePanel, i: number, j: number): PairPanel {
  return {
    legA: universe.symbols[i]!,
    legB: universe.symbols[j]!,
    timestamps: universe.timestamps,
    closesA: universe.closes[i]!,
    closesB: universe.closes[j]!,
  };
}

export function diagnosticsFor(
  ts: readonly number[],
  a: readonly number[],
  b: readonly number[],
): PairSelectionDiagnostics {
  const candlesA = candles(ts, a);
  const candlesB = candles(ts, b);
  const { cointegrated, pValue } = testCointegration(candlesA, candlesB);
  const stats = computeSpreadStatistics(candlesA, candlesB, ts.length);
  return {
    correlation: pearsonCorrelation([...a], [...b]),
    cointegrated,
    pValue,
    halfLife: Number.isFinite(stats.halfLife) ? stats.halfLife : null,
    observationCount: ts.length,
  };
}
