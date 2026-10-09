export interface KyleDuttaMadhavanParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly numDealers: number;
  readonly dealerRiskAversion: number;
  readonly adverseSelectionBase: number;
  readonly traderRiskAversion: number;
  readonly impactParam: number;
}
export interface KyleDuttaMadhavanStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly effectiveLambda: number;
  readonly stepCost: number;
}
export interface KyleDuttaMadhavanResult {
  readonly trajectory: readonly KyleDuttaMadhavanStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly costSavings: number;
  readonly terminalShares: number;
}
