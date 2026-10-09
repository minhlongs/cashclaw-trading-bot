export interface MRRTradeTick {
  readonly price: number;
  readonly tradeDirection: 1 | -1; // 1 = buyer-initiated, -1 = seller-initiated
}

export interface MRRDecompositionResult {
  readonly spread: number;
  readonly adverseSelectionShare: number; // theta: fraction attributed to asymmetric info
  readonly orderProcessingShare: number; // phi: fraction attributed to order handling/risk
  readonly orderPersistence: number; // rho: autocorrelation of trade flow
  readonly residualVariance: number;
}
