export interface AlmgrenExecutionParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly volatility: number;
  readonly riskAversion: number;
  readonly temporaryImpactEta: number;
  readonly powerExponent?: number;
  readonly permanentImpactGamma?: number;
}

export interface AlmgrenExecutionStep {
  readonly step: number;
  readonly remainingShares: number;
  readonly tradeSize: number;
  readonly tradingSpeed: number;
}

export interface AlmgrenExecutionResult {
  readonly schedule: readonly AlmgrenExecutionStep[];
  readonly expectedCost: number;
  readonly variance: number;
  readonly utility: number;
  readonly halfLife: number;
}
