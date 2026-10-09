export interface SchiedZhangParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly numSteps: number;
  readonly timeHorizon: number;
  readonly hurstParameter: number; // H in (0, 0.5]
  readonly baseVolatility: number;
  readonly riskAversion: number;
  readonly temporaryImpact: number;
}

export interface SchiedZhangStep {
  readonly step: number;
  readonly time: number;
  readonly sharesExecuted: number;
  readonly sharesRemaining: number;
  readonly localVolatility: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface SchiedZhangResult {
  readonly trajectory: readonly SchiedZhangStep[];
  readonly totalExecutionCost: number;
  readonly vwapPrice: number;
  readonly terminalShares: number;
  readonly roughnessMultiplier: number;
}
