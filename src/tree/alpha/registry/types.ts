// Research Registry — Types
// Machine-readable record of every alpha research experiment.
// Pure domain types: no I/O, no runtime dependencies.

/** Lifecycle status of a research entry. */
export type ResearchStatus = 'PROPOSED' | 'RUNNING' | 'SURVIVED' | 'FALSIFIED' | 'ARCHIVED';

/**
 * Reproducibility level of an entry.
 * - 'full': exact config + seed + git commit recorded; the run is replayable.
 * - 'class-level': hypothesis class falsified as a whole; per-config
 *   granularity is not reconstructable (e.g. seeded from the markdown
 *   falsification report).
 */
export type ReproducibilityLevel = 'full' | 'class-level';

/** ISO-8601 date or datetime string (e.g. '2026-08-18'). */
export type IsoDate = string;

/** A bounded data window used by an experiment. */
export interface ResearchPeriod {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

/** Cost assumptions applied to every backtest (basis points). */
export interface ResearchCosts {
  /** Fee in basis points (10 bps = 0.10%). */
  readonly feeBps: number;
  /** Market impact in basis points. */
  readonly impactBps: number;
}

/** Slippage assumptions applied to every backtest (basis points). */
export interface ResearchSlippage {
  readonly slippageBps: number;
}

/** Outcome metrics recorded for an experiment. */
export interface ResearchResult {
  /** Number of out-of-sample windows that passed all OOS criteria. */
  readonly oosPassCount: number;
  /** Total number of out-of-sample windows tested. */
  readonly oosTotalCount: number;
  /** Aggregate net PnL across OOS windows (USD). */
  readonly aggregatePnlUsd: number;
  /** Human-readable summary of the outcome. */
  readonly summary: string;
}

/**
 * One machine-readable research record.
 */
export interface ResearchEntry {
  readonly id: string;
  readonly hypothesis: string;
  readonly dataSources: readonly string[];
  readonly featureSet: readonly string[];
  readonly regime: string;
  readonly trainPeriod: ResearchPeriod;
  readonly validationPeriod: ResearchPeriod;
  readonly oosPeriod: ResearchPeriod;
  readonly costs: ResearchCosts;
  readonly slippage: ResearchSlippage;
  readonly seed: number | null;
  readonly gitCommit: string | null;
  readonly result: ResearchResult;
  readonly falsificationReason: string | null;
  readonly status: ResearchStatus;
  readonly reproducibility: ReproducibilityLevel;
}

/** Immutable snapshot of all research entries plus derived counts. */
export interface ResearchRegistry {
  readonly entries: readonly ResearchEntry[];
  readonly counts: Readonly<Record<ResearchStatus, number>>;
}

/** Aggregate statistics answering "how many tested / survived OOS". */
export interface RegistrySummary {
  readonly total: number;
  readonly proposed: number;
  readonly running: number;
  readonly survived: number;
  readonly falsified: number;
  readonly archived: number;
  /** Total OOS windows that passed across all entries. */
  readonly oosPassCount: number;
}
