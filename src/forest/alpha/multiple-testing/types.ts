// Multiple-Testing Defense — Types
// Statistical safeguard types for the research queue (mission §9).
// Pure domain types: no I/O, no randomness, no Node APIs.
// Overfitting-proxy types live in overfitting-types.ts.

import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { WalkForwardResult } from '@/forest/backtest/walkforward';
import type {
  BootstrapOptions,
  PermutationOptions,
  RandomEntryComparisonOptions,
  WalkForwardConsistencyOptions,
  CrossAssetConsistencyOptions,
} from './types-stats';

export * from './types-stats';

/**
 * Multiple-testing counters (mission §9): track how much of the search
 * space has been consumed so survivors are judged against the full
 * testing burden, not a single result.
 */
export interface MultipleTestingCounters {
  /** Distinct hypotheses tested (registry + queue). */
  readonly hypothesesTested: number;
  /** Distinct configurations tested (config hashes). */
  readonly configurations: number;
  /** Distinct datasets consumed. */
  readonly datasets: number;
  /** Distinct regimes covered. */
  readonly regimes: number;
  /** Distinct assets covered. */
  readonly assets: number;
  /** Total out-of-sample windows that passed across all entries/jobs. */
  readonly oosPasses: number;
}

/**
 * Distinct-value accumulators behind the counters: the sets of
 * hypotheses, configurations, datasets, regimes, and assets seen so
 * far. Counter values are the set sizes, so accumulation is exact.
 */
export interface CounterKnownSets {
  readonly hypotheses: readonly string[];
  readonly configurations: readonly string[];
  readonly datasets: readonly string[];
  readonly regimes: readonly string[];
  readonly assets: readonly string[];
}

/** Full input bundle for `evaluateSurvival`. */
export interface SurvivalEvaluationInput {
  /** Per-trade returns (net of costs) for the bootstrap CI. */
  readonly tradeReturns: readonly number[];
  /** Strategy returns aligned with entry signals (permutation test). */
  readonly strategyReturns: readonly number[];
  /** Entry-signal series aligned with `strategyReturns`. */
  readonly entrySignals: readonly number[];
  /** Walk-forward result to check for window-to-window consistency. */
  readonly walkForward: WalkForwardResult;
  /** Config x OOS-window metric matrix for the PBO proxy. */
  readonly configMatrix: readonly (readonly number[])[];
  /** Cross-asset evaluation reports (one per asset). */
  readonly crossAssetReports: readonly EvaluationReport[];
  /** Random-entry baseline report produced by `runBaseline`. */
  readonly baselineReport: EvaluationReport;
  /** Strategy's own evaluation report. */
  readonly report: EvaluationReport;
  /** Bootstrap options (explicit seed). */
  readonly bootstrap: BootstrapOptions;
  /** Permutation options (explicit seed). */
  readonly permutation: PermutationOptions;
  /** Walk-forward consistency thresholds. */
  readonly walkForwardOptions: WalkForwardConsistencyOptions;
  /** Cross-asset consistency thresholds. */
  readonly crossAssetOptions: CrossAssetConsistencyOptions;
  /** PBO proxy ceiling: pbo above this falsifies. */
  readonly maxPbo: number;
  /** Significance level for the permutation test. */
  readonly significanceLevel?: number;
  /** Random-entry comparison options. */
  readonly randomEntryOptions?: RandomEntryComparisonOptions;
}

/** Final survival verdict — the only place a job earns SURVIVED. */
export interface SurvivalVerdict {
  readonly verdict: 'survived' | 'falsified';
  /** One reason per failed check (empty when survived). */
  readonly reasons: readonly string[];
}
