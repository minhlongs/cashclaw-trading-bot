export interface VwapStep {
  bucket: number;
  scheduledShares: number;
  remainingShares: number;
  executionPrice: number;
  stepImpact: number;
  stepCost: number;
}

export interface BialkowskiVwapParams {
  totalShares: number;
  initialPrice: number;
  intradayVolumeWeights: number[];
  impactParam?: number;
  permImpactParam?: number;
}

export interface BialkowskiVwapResult {
  schedule: VwapStep[];
  totalExecutionCost: number;
  effectiveVWAP: number;
  trackingErrorBps: number;
}
