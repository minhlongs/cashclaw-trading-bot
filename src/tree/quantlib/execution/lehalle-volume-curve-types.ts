export interface LehalleVolumeCurveStep {
  readonly step: number;
  readonly targetFraction: number;
  readonly allocatedShares: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly trackingErrorBps: number;
  readonly stepCost: number;
}

export interface LehalleVolumeCurveParams {
  readonly totalShares: number;
  readonly volumeCurve: readonly number[];
  readonly initialPrice: number;
  readonly temporaryImpact?: number;
  readonly trackingAversion?: number;
  readonly volatility?: number;
}

export interface LehalleVolumeCurveResult {
  readonly schedule: readonly LehalleVolumeCurveStep[];
  readonly totalCost: number;
  readonly effectivePrice: number;
  readonly vwapTrackingErrorBps: number;
  readonly objectiveUtility: number;
}
