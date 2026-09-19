// Walk-Forward Composition Evaluation
// Evaluates alpha composition across sliding or expanding train/validate/test windows.
// Pure orchestration — no I/O, no network, no ambient clock.
// Facade: re-exports submodules for 100% backward compatibility.

import { computeSlices } from '@/forest/backtest/walkforward';
import { evaluateSlice, buildWindowBounds } from './walk-forward-helpers';
import { stitchOosPeriods } from './walk-forward-stitch';
import { computeSummaryStats } from './walk-forward-summary';
import type {
  CompositionWalkForwardInput,
  CompositionWalkForwardResult,
} from './types';

export { sliceSubMap, evaluateSlice, buildWindowBounds } from './walk-forward-helpers';
export { stitchOosPeriods } from './walk-forward-stitch';
export { computeSummaryStats } from './walk-forward-summary';

export function runCompositionWalkForward(
  input: CompositionWalkForwardInput,
): CompositionWalkForwardResult {
  const timestamps = input.timestamps ??
    [...input.alphasAtEachT.keys()].sort((a, b) => a - b);

  const slices = computeSlices(timestamps.length, input.windowConfig, input.mode);

  const windows = slices.map((s, idx) => {
    const bounds = buildWindowBounds(s, timestamps);
    const trainResult = evaluateSlice(timestamps, s.trainStart, s.trainEnd, input);
    const validateResult = evaluateSlice(timestamps, s.validateStart, s.validateEnd, input);
    const testResult = evaluateSlice(timestamps, s.testStart, s.testEnd, input);

    return {
      windowIndex: idx,
      bounds,
      trainResult,
      validateResult,
      testResult,
    };
  });

  const oosPeriods = windows.flatMap((w) => w.testResult.periods);
  const stitched = stitchOosPeriods(oosPeriods, input.config);
  const summaryStats = computeSummaryStats(windows);

  return {
    windows,
    stitched,
    summaryStats,
  };
}
