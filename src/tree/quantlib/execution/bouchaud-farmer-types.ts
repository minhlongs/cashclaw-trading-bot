export interface BouchaudFarmerParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly numTrades: number;
  readonly memoryDecayExponent: number; // gamma in C(l) ~ l^(-gamma), typically 0.5
  readonly bareImpactMagnitude: number;
  readonly tradeSign?: 1 | -1;
}

export interface BouchaudFarmerStep {
  readonly tradeIndex: number;
  readonly sharesExecuted: number;
  readonly sharesRemaining: number;
  readonly autocorrelation: number;
  readonly dressedImpact: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface BouchaudFarmerResult {
  readonly trajectory: readonly BouchaudFarmerStep[];
  readonly totalExecutionCost: number;
  readonly vwapPrice: number;
  readonly terminalImpact: number;
  readonly hurstExponent: number;
}
