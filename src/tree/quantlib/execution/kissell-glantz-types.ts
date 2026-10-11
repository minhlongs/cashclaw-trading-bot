export interface KissellGlantzStep {
  readonly bucket: number;
  readonly sharesTraded: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepImpact: number;
  readonly stepCost: number;
  readonly varianceRisk: number;
}

export interface KissellGlantzParams {
  readonly totalShares: number;
  readonly initialPrice: number;
  readonly adv?: number;
  readonly volatility?: number;
  readonly riskAversion?: number;
  readonly numBuckets?: number;
  readonly a1?: number;
  readonly a2?: number;
  readonly a3?: number;
  readonly permImpact?: number;
}

export interface KissellGlantzResult {
  readonly schedule: readonly KissellGlantzStep[];
  readonly totalExecutionCost: number;
  readonly effectivePrice: number;
  readonly implementationShortfallBps: number;
  readonly totalVariance: number;
  readonly frontierUtility: number;
}
