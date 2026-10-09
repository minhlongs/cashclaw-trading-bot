export interface BertsimasHummelParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly impactParam: number;
  readonly alphaSignal: number;
  readonly alphaDecay: number;
  readonly signalSensitivity: number;
  readonly riskAversion: number;
}

export interface BertsimasHummelStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly currentAlpha: number;
  readonly stepCost: number;
}

export interface BertsimasHummelResult {
  readonly trajectory: readonly BertsimasHummelStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly costSavings: number;
  readonly terminalShares: number;
}
