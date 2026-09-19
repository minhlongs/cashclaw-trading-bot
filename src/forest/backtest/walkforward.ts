// Backtest Engine — Walk-Forward Validation
// Sliding or expanding window optimization that never tests on training data.

import type { BacktestResult } from './types';
import type { Candle } from './ohlcv';
import { RegimeLabel } from '@/tree/regime/types';
import type {
  WindowConfig,
  WindowMode,
  WalkForwardWindow,
  WalkForwardResult,
  RunBacktestFn,
  DetectRegimeFn,
  AggregatedMetrics,
} from './walkforward-types';
import {
  averageResults,
  computeSlices,
} from './walkforward-slices';

export {
  type WindowConfig,
  type WindowMode,
  type WalkForwardWindow,
  type SummaryStats,
  type WalkForwardResult,
  type RunBacktestFn,
  type DetectRegimeFn,
  type WindowSlice,
} from './walkforward-types';
export { computeSlices } from './walkforward-slices';

export function runWalkForward(
  candles: Candle[],
  config: WindowConfig,
  mode: WindowMode,
  runBacktestFn: RunBacktestFn,
  detectRegimeFn: DetectRegimeFn,
): WalkForwardResult {
  const slices = computeSlices(candles.length, config, mode);
  if (slices.length === 0) {
    throw new Error('No valid windows produced — check config vs candle count');
  }

  const windows: WalkForwardWindow[] = slices.map(s => ({
    trainStart: s.trainStart, trainEnd: s.trainEnd,
    validateStart: s.validateStart, validateEnd: s.validateEnd,
    testStart: s.testStart, testEnd: s.testEnd,
    trainMetrics: runBacktestFn(candles.slice(s.trainStart, s.trainEnd)),
    validateMetrics: runBacktestFn(candles.slice(s.validateStart, s.validateEnd)),
    testMetrics: runBacktestFn(candles.slice(s.testStart, s.testEnd)),
    regimeAtTestStart: detectRegimeFn(candles, s.testStart),
  }));

  const inSample = averageResults(windows.map(w => w.trainMetrics));
  const validation = averageResults(windows.map(w => w.validateMetrics));
  const outOfSample = averageResults(windows.map(w => w.testMetrics));

  // Group test results by regime
  const regimeMap = new Map<RegimeLabel, BacktestResult[]>();
  for (const w of windows) {
    const existing = regimeMap.get(w.regimeAtTestStart) ?? [];
    existing.push(w.testMetrics);
    regimeMap.set(w.regimeAtTestStart, existing);
  }
  const byRegime: Record<RegimeLabel, AggregatedMetrics> = {} as Record<RegimeLabel, AggregatedMetrics>;
  for (const [label, results] of regimeMap) {
    byRegime[label] = averageResults(results);
  }

  const avgIn = inSample.sharpe_ratio ?? 0;
  const avgOut = outOfSample.sharpe_ratio ?? 0;
  return {
    windows,
    aggregated: {
      inSample, validation, outOfSample, byRegime,
      summaryStats: {
        totalWindows: windows.length,
        avgInSampleSharpe: Number(avgIn.toFixed(4)),
        avgOutSampleSharpe: Number(avgOut.toFixed(4)),
        degradationRatio: avgIn !== 0 ? Number((avgOut / avgIn).toFixed(4)) : 0,
        regimeDiversity: regimeMap.size,
      },
    },
  };
}
