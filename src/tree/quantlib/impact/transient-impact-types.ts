export interface TransientImpactConfig {
  readonly gamma?: number;
  readonly alpha?: number;
  readonly epsilon?: number;
}

export interface ImpactExecutionSlice {
  readonly time: number;
  readonly quantity: number;
}

export interface TransientImpactResult {
  readonly instantaneousImpactBps: number;
  readonly accumulatedPriceImpactBps: number;
  readonly totalExecutionSlippageCost: number;
  readonly trajectoryProfile: ReadonlyArray<{ time: number; impactBps: number }>;
}
