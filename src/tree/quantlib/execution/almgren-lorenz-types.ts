export interface AlmgrenLorenzParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly volatility: number;
  readonly urgencyCoeff: number;
  readonly adaptiveSensitivity: number;
  readonly initialPrice: number;
  readonly temporaryImpactCoeff: number;
  readonly priceTrajectory?: readonly number[];
}

export interface AlmgrenLorenzStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSize: number;
  readonly tradeSpeed: number;
  readonly currentPrice: number;
  readonly adaptiveSpeedFactor: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface AlmgrenLorenzResult {
  readonly trajectory: readonly AlmgrenLorenzStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly adaptationBenefit: number;
  readonly terminalShares: number;
}
