// Walk-Forward Composition Evaluation — Slice helpers
// Pure functions for slicing timestamp maps and building window bounds.
// No I/O, no network, no ambient clock.

import type { WindowSlice } from '@/forest/backtest/walkforward';
import { evaluateComposition } from './evaluate';
import type {
  CompositionEvalResult,
  CompositionWalkForwardInput,
  CompositionWindowBounds,
} from './types';

export function sliceSubMap<T>(map: ReadonlyMap<number, T>, ts: readonly number[]): Map<number, T> {
  const sub = new Map<number, T>();
  for (const t of ts) {
    const v = map.get(t);
    if (v !== undefined) sub.set(t, v);
  }
  return sub;
}

export function evaluateSlice(
  timestamps: readonly number[],
  start: number,
  end: number,
  input: CompositionWalkForwardInput,
): CompositionEvalResult {
  const sliceTs = timestamps.slice(start, end);
  const alphas = sliceSubMap(input.alphasAtEachT, sliceTs);
  const returns = sliceSubMap(input.returnSeriesAtEachT, sliceTs);
  const risks = sliceSubMap(input.riskInputsAtEachT, sliceTs);
  return evaluateComposition(alphas, returns, risks, input.config);
}

export function buildWindowBounds(
  s: WindowSlice,
  timestamps: readonly number[],
): CompositionWindowBounds {
  return {
    trainStart: s.trainStart,
    trainEnd: s.trainEnd,
    validateStart: s.validateStart,
    validateEnd: s.validateEnd,
    testStart: s.testStart,
    testEnd: s.testEnd,
    trainStartTime: timestamps[s.trainStart] ?? 0,
    trainEndTime: timestamps[s.trainEnd - 1] ?? 0,
    testStartTime: timestamps[s.testStart] ?? 0,
    testEndTime: timestamps[s.testEnd - 1] ?? 0,
  };
}
