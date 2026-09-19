// Walk-Forward Composition Evaluation — Summary Statistics
// Computes in-sample/out-of-sample sharpe averages, degradation ratio, and positive OOS fraction.
// Pure math — no I/O, no network, no ambient clock.

import type {
  CompositionSummaryStats,
  CompositionWindowResult,
} from './types';

export function computeSummaryStats(
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
