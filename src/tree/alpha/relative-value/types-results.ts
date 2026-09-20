// Relative-value (pair spread) research result & validation types.
// Pure types only — no I/O, no network, no Node APIs.

import type { PairPositionState } from './types-config';

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
