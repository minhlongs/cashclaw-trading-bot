// Relative-value (pair spread) research types.
// Pure types only — no I/O, no network, no Node APIs.

import type { StressMode } from '@/tree/alpha/cost-stress';

/**
 * A candidate pair. The spread regresses legB on legA:
 * spread = closeB − β·closeA (long_spread = long B / short β units of A).
 */
export interface PairDefinition {
  readonly legA: string;
  readonly legB: string;
}

/**
 * Aligned close panel for both legs. `timestamps` are ms epoch, strictly
 * increasing; `closesA[i]` / `closesB[i]` are the closes AT `timestamps[i]`.
 * All three arrays must have equal length (validated by callers).
 */
export interface PairPanel {
  readonly legA: string;
  readonly legB: string;
  readonly timestamps: readonly number[];
  readonly closesA: readonly number[];
  readonly closesB: readonly number[];
}

/**
 * Spread state at decision time t. Every field is built exclusively from
 * panel entries with timestamp < t (causal contract). All-null + reason is
 * the fail-closed state — never forward-filled, never a stale carry.
 */
export interface SpreadStateAtTime {
  readonly timestamp: number;
  readonly hedgeRatio: number | null;
  readonly spread: number | null;
  readonly zScore: number | null;
  /** Present only when the state is degenerate (all-null fields). */
  readonly reason?: string;
}

/** Configuration for the pair spread simulator. */
export interface PairSimConfig {
  /** Rolling OLS window (observations) for the hedge ratio. */
  readonly hedgeWindow: number;
  /** Trailing spread observations used for the z-score. */
  readonly zWindow: number;
  /** Minimum aligned observations for hedge-ratio estimation. */
  readonly minObs: number;
  /** Enter long_spread when z ≤ −entryZ; short when z ≥ +entryZ. */
  readonly entryZ: number;
  /** Exit threshold (must satisfy entryZ > exitZ ≥ 0). */
  readonly exitZ: number;
  /** Optional hard stop: force flat when |z| ≥ stopZ. */
  readonly stopZ?: number;
  /** Validation gate: finite half-life must be ≤ this (periods). */
  readonly maxHalfLife: number;
  /** Validation gate: |Pearson correlation| floor on the close slice. */
  readonly minCorrelation: number;
  /** Trailing observations used by the tradability validation gate. */
  readonly validationWindow: number;
  /** Re-run the validation gate every N periods. */
  readonly revalidateEvery: number;
  /** Explicit per-unit-turnover cost in bps; overrides stressMode when set. */
  readonly costBps?: number;
  /** Stress mode (fee + slippage + impact) when costBps is absent. */
  readonly stressMode?: StressMode;
  /** Minimum panel length required to run (fail-closed below it). */
  readonly minObservations: number;
  /**
   * Hedge-ratio policy: 'rolling' (default) re-estimates β(t) from strictly
   * prior data at every timestamp; 'frozen' estimates β ONCE at the first
   * timestamp with strictly-prior data and holds it constant afterwards.
   * Optional — omit for current behavior.
   */
  readonly hedgeMode?: 'rolling' | 'frozen';
  /**
   * In-simulator tradability gate toggle. Default TRUE (fail-closed
   * preserved); false skips gate runs entirely (trail records 'skipped').
   */
  readonly inSimTradabilityGate?: boolean;
  /**
   * Pure causal entry filter: entries (FLAT → position) are suppressed when
   * this returns false at the decision timestamp. Exits are NEVER blocked.
   */
  readonly entryFilter?: (timestamp: number) => boolean;
}

/**
 * Position state machine states. Three states: flat, long the spread
 * (long B / short β·A), short the spread (short B / long β·A).
 */
export type PairPositionState = 'flat' | 'long_spread' | 'short_spread';

/**
 * One simulation period's record. Carries every field of the cross-sectional
 * RebalanceRecord (timestamp, weights, turnover, costPct, grossReturn,
 * netReturn, grossExposure, netExposure) so period arrays are structurally
 * assignable to attributeCosts / attributeLongShortProportional.
 */
export interface PairPeriodRecord {
  /** Timestamp at which the position was decided (earns return t→t+1). */
  readonly timestamp: number;
  readonly position: PairPositionState;
  readonly hedgeRatio: number | null;
  readonly zScore: number | null;
  /** Return-space weights decided at `timestamp` (zero weights omitted). */
  readonly weights: Record<string, number>;
  /** One-sided turnover vs the previous period (0.5 · Σ|Δw|). */
  readonly turnover: number;
  /** Transaction cost as a fraction of equity (turnover × cost fraction). */
  readonly costPct: number;
  /** Σ w_i · r_i before costs, earned over t→t+1. */
  readonly grossReturn: number;
  /** grossReturn − costPct. */
  readonly netReturn: number;
  /** Σ|w|. */
  readonly grossExposure: number;
  /** Σw. */
  readonly netExposure: number;
}

/** One validation gate run recorded by the simulator. */
export interface PairValidationEntry {
  readonly timestamp: number;
  readonly tradable: boolean;
  readonly reasons: readonly string[];
}

/** Full pair spread simulation output. */
export interface PairSimResult {
  readonly periods: PairPeriodRecord[];
  /** Compounded from 1.0; length = periods.length + 1. */
  readonly equityCurve: number[];
  /** Σ per-period turnover. */
  readonly totalTurnover: number;
  /** Σ per-period costPct. */
  readonly totalCosts: number;
  /** Position transitions away from or into flat. */
  readonly tradeCount: number;
  /** Non-fatal degradations (e.g. null β while positioned → forced exit). */
  readonly warnings: string[];
  /** Every validation gate run, in order. */
  readonly validationTrail: PairValidationEntry[];
}
