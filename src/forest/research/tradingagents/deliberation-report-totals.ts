import type { DeliberationTotals, StageOutcome, StageResult } from './deliberation-report-contracts';
import type { DeliberationReport } from './report-types';

const TOTAL_KEYS: ReadonlyArray<readonly [StageOutcome, keyof DeliberationTotals]> = [
  ['completed', 'completed'],
  ['failed', 'failed'],
  ['skipped', 'skipped'],
  ['rejected', 'rejected'],
];

export function computeDeliberationTotals(results: readonly StageResult[]): DeliberationTotals {
  const totals: DeliberationTotals = { completed: 0, failed: 0, skipped: 0, rejected: 0, total: results.length };
  const mutable = totals as Record<keyof DeliberationTotals, number>;
  for (const result of results) {
    const key = TOTAL_KEYS.find(([outcome]) => outcome === result.outcome);
    if (key !== undefined) mutable[key[1]] += 1;
  }
  return totals;
}

export function sumBuckets(totals: DeliberationTotals): number {
  return TOTAL_KEYS.reduce((sum, [, key]) => sum + totals[key], 0);
}

export function assertNoSilentSkips(report: DeliberationReport, stageCount: number): void {
  const bucketSum = sumBuckets(report.totals);
  if (bucketSum !== stageCount) {
    throw new Error(`DeliberationReport silent-skip detected: bucket sum ${bucketSum} !== stage count ${stageCount}`);
  }
  if (report.totals.total !== stageCount) {
    throw new Error(`DeliberationReport silent-skip detected: totals.total ${report.totals.total} !== stage count ${stageCount}`);
  }
}
