// AlphaImportReport — fail-closed classification report for zoo imports.
// Every manifest entry lands in EXACTLY ONE of 7 buckets (D3 precedence);
// the Σ-buckets ≡ entry-count invariant is enforced by assertNoSilentSkips,
// which the adapter itself invokes before returning. Pure module: no I/O.

import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { DataWindow } from '../experiment-spec';

/** Importer identity stamped on hypotheses + provenance records. */
export const ZOO_IMPORTER_VERSION = 'alphazoo-adapter@1' as const;
export type ZooImporterVersion = typeof ZOO_IMPORTER_VERSION;

/**
 * Adapter configuration. Pure by construction: the caller supplies the
 * universe map and data window — the adapter NEVER fetches data or I/O.
 */
export interface ZooAdapterConfig {
  /** Zoo market tag → caller-supplied Universe. Unconfigured tag ⇒ OUT_OF_UNIVERSE. */
  readonly marketUniverses: Readonly<Record<string, Universe>>;
  /** Available data window handed to the AlphaCompiler (required — escrow E2-1). */
  readonly dataWindow: DataWindow;
  /** Stress mode stamped as costAssumption on synthesized hypotheses. */
  readonly defaultCostMode: StressMode;
  /** Injected clock for deterministic createdAt (defaults to current time). */
  readonly nowIso?: string;
  readonly importerVersion: ZooImporterVersion;
}

/**
 * Exactly one primary outcome per entry, in D3 precedence order:
 * validation-error → unsupported → non-causal → duplicate → rejected →
 * adapted → imported.
 */
export const ALPHA_IMPORT_OUTCOMES = [
  'validation-error',
  'unsupported',
  'non-causal',
  'duplicate',
  'rejected',
  'adapted',
  'imported',
] as const;
export type AlphaImportOutcome = (typeof ALPHA_IMPORT_OUTCOMES)[number];

/** Classification of one zoo entry. */
export interface PerAlphaResult {
  readonly sourceAlphaId: string;
  readonly outcome: AlphaImportOutcome;
  /** Non-empty reason list for every non-imported outcome. */
  readonly reasons: readonly string[];
  /** Present iff the entry was registered (adapted or imported). */
  readonly hypothesisId?: string;
}

/** Bucket counters — one per outcome plus the entry total. */
export interface AlphaImportTotals {
  readonly validationError: number;
  readonly unsupported: number;
  readonly nonCausal: number;
  readonly duplicate: number;
  readonly rejected: number;
  readonly adapted: number;
  readonly imported: number;
  readonly total: number;
}

/** Fail-closed import report: counters + per-entry results. */
export interface AlphaImportReport {
  readonly totals: AlphaImportTotals;
  readonly results: readonly PerAlphaResult[];
}

const TOTAL_KEYS: ReadonlyArray<readonly [AlphaImportOutcome, keyof AlphaImportTotals]> = [
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
