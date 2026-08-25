// Research Queue — Types
// Lifecycle record for every alpha research job. Pure domain types:
// no I/O, no runtime dependencies, no forest imports (layer contract).

import type { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type {
  ResearchCosts,
  ResearchResult,
  ResearchSlippage,
} from '@/tree/alpha/registry/types';

/** Lifecycle state of a research queue job. */
export type QueueState =
  | 'PROPOSED'
  | 'VALIDATING'
  | 'RUNNING'
  | 'EVALUATED'
  | 'SURVIVED'
  | 'FALSIFIED'
  | 'ARCHIVED';

/** Events that move a job through the queue lifecycle. */
export type QueueTrigger =
  | 'validate'
  | 'withdraw'
  | 'validation_passed'
  | 'validation_failed'
  | 'evaluation_complete'
  | 'run_failed'
  | 'survived'
  | 'falsified'
  | 'archive';

/** One applied transition (audit record shape). */
export interface TransitionRecord {
  readonly from: QueueState;
  readonly to: QueueState;
  readonly trigger: QueueTrigger;
}

/**
 * One research queue job with full provenance (mission §11).
 * `configHash` covers configuration fields only — outcome fields
 * (`status`, `result`) are excluded so the same configuration always
 * hashes identically regardless of lifecycle progress.
 */
export interface ResearchQueueJob {
  /** Unique identifier (slug, e.g. 'queue-0001-funding-fade'). */
  readonly id: string;
  /** Human-readable hypothesis statement. */
  readonly hypothesis: string;
  /** Why this hypothesis is worth testing (falsifiable rationale). */
  readonly rationale: string;
  /** Feature set the job declares (causal declaration discipline). */
  readonly features: readonly string[];
  /** Dataset identifier the job consumes. */
  readonly dataset: string;
  /** Regime scope for the experiment. */
  readonly regime: RegimeLabel;
  /** Cross-sectional universe the job trades over. */
  readonly universe: Universe;
  /** Cost model applied to every backtest. */
  readonly costs: ResearchCosts;
  /** Slippage model applied to every backtest. */
  readonly slippage: ResearchSlippage;
  /** PRNG seed (null when deterministic by construction). */
  readonly seed: number | null;
  /** Lineage parent hypothesis id (null for root hypotheses). */
  readonly parentHypothesis: string | null;
  /** Who/what proposed the job (human id or generator name). */
  readonly generatedBy: string;
  /** Unix timestamp (ms) when the job was proposed. */
  readonly timestamp: number;
  /** Git commit SHA of the proposing code (null when unavailable). */
  readonly gitSha: string | null;
  /** Current lifecycle state. */
  readonly status: QueueState;
  /** Deterministic hash of the configuration fields only. */
  readonly configHash: string;
  /** Recorded outcome (null until evaluation completes). */
  readonly result: ResearchResult | null;
}

/**
 * Job specification supplied to `enqueue`. The queue derives `status`,
 * `configHash`, and `result` itself — callers never supply them.
 */
export type QueueJobSpec = Omit<ResearchQueueJob, 'status' | 'configHash' | 'result'>;

/** Immutable snapshot of all queued jobs. */
export interface ResearchQueue {
  readonly jobs: readonly ResearchQueueJob[];
}

/** Aggregate counts of jobs by lifecycle state. */
export interface QueueSummary {
  readonly total: number;
  readonly counts: Readonly<Record<QueueState, number>>;
}
