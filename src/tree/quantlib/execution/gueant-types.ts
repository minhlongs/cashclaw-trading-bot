export interface GueantParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly impactParam: number;
  readonly powerLawExponent: number;
  readonly riskAversion: number;
  readonly terminalPenalty?: number;
}

export interface GueantStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly stepCost: number;
}

export interface GueantResult {
  readonly trajectory: readonly GueantStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly costSavings: number;
  readonly terminalShares: number;
}
