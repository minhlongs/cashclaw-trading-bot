export interface AlmgrenDriftParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly temporaryImpact: number;
  readonly riskAversion?: number;
  readonly volatility?: number;
  readonly initialDrift: number;
  readonly meanReversionSpeed: number; // kappa >= 0
}

export interface AlmgrenDriftStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly driftEstimate: number;
}

export interface AlmgrenDriftResult {
  readonly trajectory: readonly AlmgrenDriftStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly driftAlphaCapture: number;
}
