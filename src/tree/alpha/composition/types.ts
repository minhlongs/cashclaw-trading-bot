/**
 * ComposedAlpha types — standardized alpha representation for alpha composition.
 *
 * `ComposedAlpha` carries 11 fields (Mission §6): alphaId, direction,
 * confidence, expectedReturn, expectedCost, expectedTurnover, regime,
 * horizon, provenance, featureDependencies, timestamp.
 *
 * All fields are readonly — composition is an immutable transformation.
 */

import type { RegimeLabel } from '@/tree/regime/types';

export interface ComposedAlpha {
  readonly alphaId: string;
  readonly direction: 'buy' | 'sell' | 'hold';
  readonly confidence: number;
  readonly expectedReturn: number;
  readonly expectedCost: number;
  readonly expectedTurnover: number;
  readonly regime: RegimeLabel;
  readonly horizon: string;
  readonly provenance: string;
  readonly featureDependencies: readonly string[];
  readonly timestamp: number;
}

/**
 * Linear weights that define the net-edge scoring formula.
 * All weights are plain scalars — no learning, no optimization.
 */
export interface CompositionWeights {
  readonly returnWeight: number;
  readonly costWeight: number;
  readonly riskPenaltyWeight: number;
  readonly turnoverPenaltyWeight: number;
  readonly confidenceWeight: number;
}

/**
 * Configuration for alpha composition scoring.
 */
export interface CompositionConfig {
  readonly weights: CompositionWeights;
  readonly minNetEdge: number;
  readonly maxTurnover: number;
}
