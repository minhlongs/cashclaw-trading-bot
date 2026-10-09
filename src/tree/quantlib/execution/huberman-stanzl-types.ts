export interface HubermanStanzlParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly permanentImpactCoeff: number;
  readonly temporaryImpactCoeff: number;
  readonly riskAversion: number;
  readonly initialPrice: number;
}

export interface HubermanStanzlStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSize: number;
  readonly tradeSpeed: number;
  readonly permanentImpact: number;
  readonly temporaryImpact: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface HubermanStanzlResult {
  readonly trajectory: readonly HubermanStanzlStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly isManipulationFree: boolean;
  readonly quasiArbitrageMetric: number;
  readonly terminalShares: number;
}
