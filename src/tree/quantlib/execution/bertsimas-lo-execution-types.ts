export interface BertsimasLoParams {
  readonly totalShares: number;
  readonly numSteps: number;
  readonly temporaryImpactEta: number;
  readonly permanentImpactGamma?: number;
  readonly volatility?: number;
  readonly riskAversion?: number;
}

export interface BertsimasLoStep {
  readonly step: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly stepCost: number;
}

export interface BertsimasLoExecutionResult {
  readonly trajectory: readonly BertsimasLoStep[];
  readonly expectedCost: number;
  readonly twapCost: number;
  readonly immediateCost: number;
  readonly impactSavings: number;
  readonly variance: number;
}
