// Cross-sectional universe abstraction (mission §3C).
// Pure types only — no I/O, no network, no Node APIs.

/** Portfolio weighting scheme for a universe. */
export type Weighting = 'equal' | 'market' | 'custom';

/** Rebalance cadence for a universe. */
export type RebalanceRule = 'daily' | 'weekly' | 'threshold' | 'none';

/**
 * A named set of symbols treated as a single cross-sectional population.
 * `symbols` is an immutable, de-duplicated, ordered copy of the caller's input.
 */
export interface Universe {
  readonly id: string;
  readonly symbols: readonly string[];
  readonly weighting: Weighting;
  readonly rebalanceRule: RebalanceRule;
}

/** One asset's position in a ranked cross-section. */
export interface RankedAsset {
  readonly symbol: string;
  readonly score: number;
  /** 1-based rank (1 = highest score). */
  readonly rank: number;
  /** Rank-based percentile in [0, 1] (0 = best, 1 = worst). */
  readonly percentile: number;
}

/** A point-in-time ranking of every asset in a universe. */
export interface CrossSectionalSnapshot {
  readonly timestamp: number;
  readonly universeId: string;
  readonly assets: readonly RankedAsset[];
}

/** A long/short selection derived from a ranking. */
export interface LongShortSelection {
  readonly long: readonly string[];
  readonly short: readonly string[];
}

/** Valid weighting values (for runtime validation). */
export const VALID_WEIGHTINGS: readonly Weighting[] = ['equal', 'market', 'custom'];

/** Valid rebalance-rule values (for runtime validation). */
export const VALID_REBALANCE_RULES: readonly RebalanceRule[] = [
  'daily',
  'weekly',
  'threshold',
  'none',
];