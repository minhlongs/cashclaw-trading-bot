export interface EngleFerstenbergStep {
  readonly bucket: number;
  readonly sharesTraded: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepImpact: number;
  readonly stepCost: number;
  readonly volatilityRisk: number;
}

export interface EngleFerstenbergParams {
  readonly totalShares: number;
  readonly initialPrice: number;
  readonly numBuckets?: number;
  readonly riskAversion?: number;
  readonly volatility?: number;
  readonly marketVolume?: number;
  readonly permImpactParam?: number;
  readonly tempImpactParam?: number;
}

export interface EngleFerstenbergResult {
  readonly schedule: readonly EngleFerstenbergStep[];
  readonly totalExecutionCost: number;
  readonly effectivePrice: number;
  readonly implementationShortfallBps: number;
  readonly totalRiskVariance: number;
}
