export interface ObizhaevaWangParams {
  readonly totalShares: number;
  readonly numSteps: number;
  readonly resilienceRate: number;
  readonly timeStep?: number;
  readonly orderBookDepth?: number;
}

export interface ObizhaevaWangStep {
  readonly step: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly impactLevel: number;
  readonly stepCost: number;
}

export interface ObizhaevaWangExecutionResult {
  readonly trajectory: readonly ObizhaevaWangStep[];
  readonly expectedCost: number;
  readonly twapCost: number;
  readonly immediateCost: number;
  readonly impactSavings: number;
  readonly resilienceFactor: number;
}
