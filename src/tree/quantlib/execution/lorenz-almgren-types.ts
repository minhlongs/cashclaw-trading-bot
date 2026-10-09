export interface LorenzAlmgrenParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly numSteps: number;
  readonly timeHorizon: number;
  readonly volatility: number;
  readonly riskAversion: number;
  readonly temporaryImpact: number;
  readonly priceDriftSensitivity?: number;
}

export interface LorenzAlmgrenStep {
  readonly step: number;
  readonly time: number;
  readonly sharesExecuted: number;
  readonly sharesRemaining: number;
  readonly adaptiveSpeedFactor: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface LorenzAlmgrenResult {
  readonly trajectory: readonly LorenzAlmgrenStep[];
  readonly totalExecutionCost: number;
  readonly vwapPrice: number;
  readonly meanVarianceUtility: number;
  readonly terminalShares: number;
}
