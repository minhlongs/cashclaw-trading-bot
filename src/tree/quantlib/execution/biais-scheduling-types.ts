export interface BiaisSchedulingStep {
  readonly bucket: number;
  readonly sharesTraded: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly informedAdverseImpact: number;
  readonly latencyPenalty: number;
}

export interface BiaisSchedulingParams {
  readonly totalShares: number;
  readonly initialPrice: number;
  readonly numBuckets?: number;
  readonly informedArrivalProb?: number;
  readonly adverseIntensity?: number;
  readonly latencyCostRate?: number;
  readonly baseImpact?: number;
}

export interface BiaisSchedulingResult {
  readonly schedule: readonly BiaisSchedulingStep[];
  readonly totalExecutionCost: number;
  readonly effectivePrice: number;
  readonly implementationShortfallBps: number;
}
