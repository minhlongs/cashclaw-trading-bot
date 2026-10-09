export interface CarteaJaimungalOfiParams {
  readonly totalShares: number;
  readonly timeHorizon: number; // T
  readonly numSteps: number;     // N
  readonly temporaryImpact: number; // k
  readonly permanentImpact: number; // b
  readonly riskAversion: number;    // phi/gamma
  readonly ofiDrift: number;        // beta * OFI
  readonly volatility: number;      // sigma
}

export interface CarteaJaimungalOfiStep {
  readonly step: number;
  readonly tradeSpeed: number;     // nu_t
  readonly tradeSize: number;      // nu_t * dt
  readonly remainingShares: number;
  readonly stepCost: number;
}

export interface CarteaJaimungalOfiResult {
  readonly trajectory: readonly CarteaJaimungalOfiStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly ofiCostAdjustment: number;
  readonly costSavings: number;
}
