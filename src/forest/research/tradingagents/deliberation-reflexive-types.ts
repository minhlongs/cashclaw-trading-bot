export type GateVerdictType = 'PAPER_CANDIDATE' | 'KILLED' | 'INCONCLUSIVE';

export interface FactorOOSResult {
  readonly factorName: string;
  readonly icMean: number;
  readonly irRatio: number;
  readonly quantileSpread: number;
  readonly verdict: GateVerdictType;
}

export interface AgentBeliefPrior {
  readonly featureKey: string;
  readonly confidenceScore: number;
  readonly sampleCount: number;
  readonly isQuarantined: boolean;
  readonly feedbackNotes: readonly string[];
}

export interface ReflexiveDebateContext {
  readonly boostFactors: readonly string[];
  readonly penalizedFactors: readonly string[];
  readonly quarantinedFactors: readonly string[];
  readonly summaryPromptGuidance: string;
}
