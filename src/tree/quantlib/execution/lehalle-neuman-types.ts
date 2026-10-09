export interface LehalleNeumanParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly temporaryImpact: number;
  readonly permanentImpact: number;
  readonly riskAversion: number;
  readonly signalAlpha: number;
  readonly signalDecay: number;
}

export interface LehalleNeumanStep {
  readonly step: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly signalValue: number;
  readonly stepCost: number;
}

export interface LehalleNeumanResult {
  readonly trajectory: readonly LehalleNeumanStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly signalAlphaContribution: number;
  readonly costSavings: number;
}
