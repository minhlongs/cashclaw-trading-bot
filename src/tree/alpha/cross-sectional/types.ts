// Cross-sectional portfolio simulation types.
// Pure types only — no I/O, no network, no Node APIs.

import type { RankedAsset } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';

/**
 * One asset's return panel. `returns[i]` is the return earned over the
 * period STARTING at `timestamps[i]` (i.e. from timestamps[i] to the next
 * timestamp). This alignment is what makes the simulator causal: a weight
 * decided at timestamp t earns `returns[i]` where `timestamps[i] === t`.
 */
export interface AssetReturnSeries {
  readonly symbol: string;
  readonly timestamps: readonly number[];
  readonly returns: readonly number[];
}

/**
 * Custom weight builder: maps a point-in-time ranking to signed weights.
 * Must only reference symbols present in the ranking and return finite
 * numbers. Pass `marketNeutralWeights` here for neutral portfolios, or omit
 * the weighter for the default selectLongShort + equal-weight construction.
 */
export type WeighterFn = (assets: readonly RankedAsset[]) => Record<string, number>;

/** Configuration for runCrossSectionalSim. */
export interface CrossSectionalSimConfig {
  /** Number of top-ranked assets held long (equal weight 1/topN each). */
  readonly topN: number;
  /** Number of bottom-ranked assets held short (equal weight -1/bottomN each). */
  readonly bottomN: number;
  /**
   * Explicit per-unit-turnover cost in basis points (10 bps = 0.001).
   * When set, overrides stressMode.
   */
  readonly costBps?: number;
  /**
   * Stress mode resolved via resolveStressConfig (fee + slippage + impact
   * sum) when costBps is absent. Defaults to 'conservative'.
   */
  readonly stressMode?: StressMode;
  /** Minimum number of snapshots required to run (fail-closed below it). */
  readonly minObservations: number;
  /** Optional custom weighting; see WeighterFn. */
  readonly weighter?: WeighterFn;
}

/** One rebalance period's record. */
export interface RebalanceRecord {
  /** Snapshot timestamp at which weights were decided. */
  readonly timestamp: number;
  /** Signed weights decided at `timestamp` (zero weights omitted). */
  readonly weights: Record<string, number>;
  /** One-sided turnover vs the previous period (0.5 * Σ|Δw|). */
  readonly turnover: number;
  /** Transaction cost as a fraction of equity (turnover × cost fraction). */
  readonly costPct: number;
  /** Σ w_i · r_i before costs. */
  readonly grossReturn: number;
  /** grossReturn − costPct. */
  readonly netReturn: number;
  /** Σ|w|. */
  readonly grossExposure: number;
  /** Σw. */
  readonly netExposure: number;
}

/** Full simulation output. */
export interface CrossSectionalSimResult {
  readonly periods: RebalanceRecord[];
  /** Compounded from 1.0; length = periods.length + 1. */
  readonly equityCurve: number[];
  /** Σ per-period turnover. */
  readonly totalTurnover: number;
  /** Σ per-period costPct. */
  readonly totalCosts: number;
  /** Non-fatal degradations (e.g. a symbol missing one period's return). */
  readonly warnings: string[];
}

/** Result of inverse-beta tilting. */
export interface BetaTiltResult {
  readonly weights: Record<string, number>;
  readonly applied: boolean;
  readonly fallbackReason?: string;
}
