export interface ExecutionFillRecord {
  readonly sliceIndex: number;
  readonly arrivalPrice: number;
  readonly executionPrice: number;
  readonly quantity: number;
  readonly venue: string;
  readonly timestamp: number;
}

export interface SlippageAttributionBreakdown {
  readonly orderId: string;
  readonly totalExecutedQuantity: number;
  readonly arrivalPrice: number;
  readonly vwapExecutionPrice: number;
  readonly totalSlippageBps: number;
  readonly halfSpreadBps: number;
  readonly transientImpactBps: number;
  readonly permanentDriftBps: number;
}
