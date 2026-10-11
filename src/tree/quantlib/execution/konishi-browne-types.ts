export interface KonishiBrowneParams {
  totalShares: number;
  initialPrice: number;
  volumeWeights: number[];
  riskAversion?: number;
  volatility?: number;
  temporaryImpact?: number;
  permanentImpact?: number;
}

export interface KonishiBrowneStep {
  bucket: number;
  scheduledShares: number;
  remainingShares: number;
  executionPrice: number;
  stepCost: number;
  impactPenalty: number;
}

export interface KonishiBrowneResult {
  schedule: KonishiBrowneStep[];
  totalExecutionCost: number;
  effectiveVWAP: number;
  trackingErrorBps: number;
  benchmarkVWAP: number;
}
