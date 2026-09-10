// Walk-Forward Composition Evaluation
// Evaluates alpha composition across sliding or expanding train/validate/test windows.
// Pure orchestration — no I/O, no network, no ambient clock.

import { computeSlices, type WindowSlice } from '@/forest/backtest/walkforward';
import {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
} from '@/forest/alpha/cross-sectional-eval/return-metrics';
import { evaluateComposition } from './evaluate';
import type {
  CompositionEvalConfig,
  CompositionEvalResult,
  CompositionPeriodRecord,
  CompositionWindowBounds,
  CompositionWindowResult,
  CompositionSummaryStats,
  CompositionWalkForwardResult,
  CompositionWalkForwardInput,
} from './types';

function sliceSubMap<T>(map: ReadonlyMap<number, T>, ts: readonly number[]): Map<number, T> {
  const sub = new Map<number, T>();
  for (const t of ts) {
    const v = map.get(t);
    if (v !== undefined) sub.set(t, v);
  }
  return sub;
}

function evaluateSlice(
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

function buildWindowBounds(
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

function stitchOosPeriods(
  periods: readonly CompositionPeriodRecord[],
  config: CompositionEvalConfig,
): CompositionEvalResult {
  if (periods.length === 0) {
    return {
      periods: [],
      equityCurve: [1],
      totalReturn: 0,
      annualizedSharpe: null,
      annualizedSortino: null,
      maxDrawdownPct: 0,
      totalTurnover: 0,
      totalCosts: 0,
    };
  }

  const netReturns = periods.map((p) => p.netReturn);
  const equityCurve: number[] = [1];
  let eq = 1;
  let totalTurnover = 0;
  let totalCosts = 0;

  for (const p of periods) {
    eq *= 1 + p.netReturn;
    equityCurve.push(eq);
    totalTurnover += p.turnover;
    totalCosts += p.costPct;
  }

  return {
    periods,
    equityCurve,
    totalReturn: eq - 1,
    annualizedSharpe: annualizedSharpe(netReturns, config.periodsPerYear),
    annualizedSortino: annualizedSortino(netReturns, config.periodsPerYear),
    maxDrawdownPct: maxDrawdownPct(equityCurve),
    totalTurnover,
    totalCosts,
  };
}

function computeSummaryStats(
  windows: readonly CompositionWindowResult[],
): CompositionSummaryStats {
  if (windows.length === 0) {
    return {
      totalWindows: 0,
      avgInSampleSharpe: 0,
      avgOutSampleSharpe: 0,
      degradationRatio: 0,
      positiveOosFraction: 0,
    };
  }

  const inSample = windows
    .map((w) => w.trainResult.annualizedSharpe)
    .filter((s): s is number => s !== null && Number.isFinite(s));
  const outSample = windows
    .map((w) => w.testResult.annualizedSharpe)
    .filter((s): s is number => s !== null && Number.isFinite(s));

  const avgIn = inSample.length > 0
    ? inSample.reduce((a, b) => a + b, 0) / inSample.length
    : 0;
  const avgOut = outSample.length > 0
    ? outSample.reduce((a, b) => a + b, 0) / outSample.length
    : 0;

  const deg = avgIn > 0 ? avgOut / avgIn : 0;

  let positiveCount = 0;
  for (const w of windows) {
    const metric = w.testResult.annualizedSharpe ?? w.testResult.totalReturn;
    if (metric > 0) positiveCount++;
  }

  return {
    totalWindows: windows.length,
    avgInSampleSharpe: avgIn,
    avgOutSampleSharpe: avgOut,
    degradationRatio: deg,
    positiveOosFraction: positiveCount / windows.length,
  };
}

export function runCompositionWalkForward(
  input: CompositionWalkForwardInput,
): CompositionWalkForwardResult {
  const timestamps = input.timestamps ??
    [...input.alphasAtEachT.keys()].sort((a, b) => a - b);

  const slices = computeSlices(timestamps.length, input.windowConfig, input.mode);

  const windows: CompositionWindowResult[] = slices.map((s, idx) => {
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
