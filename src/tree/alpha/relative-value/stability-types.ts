// Stability type definitions for relative-value research.

import type { TradabilityGateConfig } from './validation';

/** Distinct fail-closed reasons (tested verbatim). */
export const STABILITY_REASONS = {
  insufficientObservations: 'insufficient observations before window end',
  betaUnavailable: 'hedge ratio unavailable at a sub-window boundary',
} as const;

/** Config for computePairStability (gate config + sub-window count). */
export interface PairStabilityConfig extends TradabilityGateConfig {
  /** Number of contiguous sub-windows to split the pre-asOf slice into. */
  readonly subWindows: number;
  /** Hedge-ratio window for the β-drift component. */
  readonly hedgeWindow: number;
}

/** Per-component stability measurements. */
export interface PairStabilityComponents {
  /** Fraction of sub-windows passing the conjunctive gate, in [0,1]. */
  readonly gatePassFraction: number;
  /** 1 − normalized β drift, in [0,1]. */
  readonly betaDriftPenalty: number;
  /** Zero-crossing consistency vs half-life expectation, in [0,1]. */
  readonly crossingConsistency: number;
}

/** Stability verdict: score in [0,1] plus components or a fail-closed reason. */
export interface PairStabilityResult {
  readonly score: number;
  readonly components: PairStabilityComponents | null;
  /** Present iff score is 0 due to a degenerate input. */
  readonly reason?: string;
}
