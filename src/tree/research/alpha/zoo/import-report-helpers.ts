// Pure helpers for AlphaImportReport — bucket arithmetic + invariant assertions.

import type {
  AlphaImportOutcome,
  AlphaImportTotals,
  AlphaImportReport,
  PerAlphaResult,
} from './import-report-types';

export const TOTAL_KEYS: ReadonlyArray<readonly [AlphaImportOutcome, keyof AlphaImportTotals]> = [
  ['validation-error', 'validationError'],
  ['unsupported', 'unsupported'],
  ['non-causal', 'nonCausal'],
  ['duplicate', 'duplicate'],
  ['rejected', 'rejected'],
  ['adapted', 'adapted'],
  ['imported', 'imported'],
];

/** Derive bucket counters from per-entry results (total = results.length). */
export function computeTotals(results: readonly PerAlphaResult[]): AlphaImportTotals {
  const totals: AlphaImportTotals = {
    validationError: 0,
    unsupported: 0,
    nonCausal: 0,
    duplicate: 0,
    rejected: 0,
    adapted: 0,
    imported: 0,
    total: results.length,
  };
  const mutable = totals as Record<keyof AlphaImportTotals, number>;
  for (const result of results) {
    const key = TOTAL_KEYS.find(([outcome]) => outcome === result.outcome);
    if (key !== undefined) mutable[key[1]] += 1;
  }
  return totals;
}

/** Sum the 7 bucket counters (excludes the `total` field). */
export function sumBuckets(totals: AlphaImportTotals): number {
  return TOTAL_KEYS.reduce((sum, [, key]) => sum + totals[key], 0);
}

/** Human-readable one-line summary of a report. */
export function summarizeReport(report: AlphaImportReport): string {
  const t = report.totals;
  return (
    `AlphaImportReport: ${t.total} entries — imported ${t.imported}, adapted ${t.adapted}, ` +
    `rejected ${t.rejected}, duplicate ${t.duplicate}, non-causal ${t.nonCausal}, ` +
    `unsupported ${t.unsupported}, validation-error ${t.validationError}`
  );
}

/**
 * Fail-closed invariant: Σ 7 buckets === entryCount AND totals.total ===
 * entryCount. Throws on any mismatch — a silent skip is a bug, never a
 * warning. Called inside the adapter before every report is returned.
 */
export function assertNoSilentSkips(report: AlphaImportReport, entryCount: number): void {
  const bucketSum = sumBuckets(report.totals);
  if (bucketSum !== entryCount) {
    throw new Error(
      `AlphaImportReport silent-skip detected: bucket sum ${bucketSum} !== entry count ${entryCount}`,
    );
  }
  if (report.totals.total !== entryCount) {
    throw new Error(
      `AlphaImportReport silent-skip detected: totals.total ${report.totals.total} !== entry count ${entryCount}`,
    );
  }
}
