// Zoo falsification report types (Phase 3, D5). Three-terminal verdicts:
// ALIVE_FOR_FURTHER_RESEARCH / FALSIFIED / NOT_EVALUABLE. Fail-closed
// accounting: every manifest entry lands in exactly one bucket and the
// Σ-buckets ≡ manifest-entries invariant is enforced by assertNoSilentSkips.
// Pure module: no I/O, no randomness.

/** Three-terminal falsification verdict (D5). */
export type ZooVerdict =
  | 'ALIVE_FOR_FURTHER_RESEARCH'
  | 'FALSIFIED'
  | 'NOT_EVALUABLE';

/** One statistical check's outcome for an evaluated alpha. */
export interface ZooCheckResult {
  readonly check: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** Per-alpha falsification row. */
export interface ZooFalsificationRow {
  readonly sourceAlphaId: string;
  /** Present iff the alpha was registered by the import pipeline. */
  readonly hypothesisId?: string;
  readonly verdict: ZooVerdict;
  /** Non-empty for every non-ALIVE verdict. */
  readonly reasons: readonly string[];
  /** Present iff the alpha reached the statistical checks. */
  readonly checks?: readonly ZooCheckResult[];
  /** Present iff the alpha reached IC analysis. */
  readonly icStats?: {
    readonly icMean: number | null;
    readonly icStd: number | null;
    readonly icIr: number | null;
    readonly validIcCount: number;
  };
}

/** Bucket counters — one per verdict plus the import-stage skip count. */
export interface ZooFalsificationTotals {
  readonly evaluatedAlive: number;
  readonly falsified: number;
  readonly notEvaluable: number;
  /** Manifest entries never registered by the import pipeline. */
  readonly skippedImport: number;
  readonly total: number;
}

/** Deferred-check disclosure recorded in report meta (D5). */
export interface DeferredCheck {
  readonly check: string;
  readonly reason: string;
}

/** Fail-closed falsification report: counters + rows + meta. */
export interface ZooFalsificationReport {
  readonly totals: ZooFalsificationTotals;
  readonly rows: readonly ZooFalsificationRow[];
  readonly meta: {
    readonly manifestEntries: number;
    readonly deferredChecks: readonly DeferredCheck[];
    readonly caveats: readonly string[];
  };
}

/** Derive bucket counters from rows (total = rows.length). */
export function computeZooTotals(rows: readonly ZooFalsificationRow[]): ZooFalsificationTotals {
  const totals: ZooFalsificationTotals = {
    evaluatedAlive: 0,
    falsified: 0,
    notEvaluable: 0,
    skippedImport: 0,
    total: rows.length,
  };
  const mutable = totals as Record<keyof ZooFalsificationTotals, number>;
  for (const row of rows) {
    if (row.verdict === 'ALIVE_FOR_FURTHER_RESEARCH') mutable.evaluatedAlive += 1;
    else if (row.verdict === 'FALSIFIED') mutable.falsified += 1;
    else if (row.reasons.some((r) => r.startsWith('IMPORT_SKIPPED'))) mutable.skippedImport += 1;
    else mutable.notEvaluable += 1;
  }
  return totals;
}

/** Sum the 4 bucket counters (excludes the `total` field). */
export function sumZooBuckets(totals: ZooFalsificationTotals): number {
  return totals.evaluatedAlive + totals.falsified + totals.notEvaluable + totals.skippedImport;
}

/**
 * Fail-closed invariant: evaluated_alive + falsified + not_evaluable +
 * skipped_import ≡ manifest entries AND totals.total ≡ manifest entries.
 * Throws on any mismatch — a silent skip or tampered row is a bug, never a
 * warning. Called inside the bridge before every report is returned.
 */
export function assertNoSilentSkips(report: ZooFalsificationReport, manifestEntries: number): void {
  const bucketSum = sumZooBuckets(report.totals);
  if (bucketSum !== manifestEntries) {
    throw new Error(
      `ZooFalsificationReport silent-skip detected: bucket sum ${bucketSum} !== manifest entries ${manifestEntries}`,
    );
  }
  if (report.totals.total !== manifestEntries) {
    throw new Error(
      `ZooFalsificationReport silent-skip detected: totals.total ${report.totals.total} !== manifest entries ${manifestEntries}`,
    );
  }
  if (report.rows.length !== manifestEntries) {
    throw new Error(
      `ZooFalsificationReport silent-skip detected: rows.length ${report.rows.length} !== manifest entries ${manifestEntries}`,
    );
  }
}
