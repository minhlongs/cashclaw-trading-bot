export interface AlmgrenRiskPenaltyParams {
  readonly totalShares: number;
  readonly horizonSteps: number;
  readonly volatility: number;
  readonly riskAversion: number;
  readonly temporaryImpactEta: number;
  readonly penaltyExponent?: number;
}

export interface AlmgrenRiskPenaltyResult {
  readonly trajectory: readonly number[];
  readonly expectedCost: number;
  readonly varianceCost: number;
  readonly totalPenaltyCost: number;
  readonly urgencyKappa: number;
}
