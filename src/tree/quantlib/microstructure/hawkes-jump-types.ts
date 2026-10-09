export interface HawkesToxicityConfig {
  readonly baselineIntensity: number; // mu (> 0)
  readonly excitationAlpha: number; // alpha (> 0)
  readonly decayBeta: number; // beta (> alpha to maintain subcriticality)
  readonly cascadeThreshold: number; // branching ratio threshold (e.g. 0.85)
}

export interface HawkesEvent {
  readonly timestampMs: number;
  readonly volume: number;
}

export interface HawkesToxicityResult {
  readonly currentIntensity: number;
  readonly branchingRatio: number;
  readonly isCascadingToxicity: boolean;
  readonly clusteringFactor: number;
}

export interface LedoitWolfShrinkageResult {
  readonly shrinkageIntensity: number;
  readonly covarianceMatrix: readonly (readonly number[])[];
  readonly conditionNumber: number;
}
