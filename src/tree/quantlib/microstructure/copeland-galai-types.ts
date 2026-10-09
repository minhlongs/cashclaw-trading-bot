export interface CopelandGalaiParams {
  readonly assetPrice: number;
  readonly volatility: number;
  readonly timeToQuoteExpirySec: number;
  readonly informedTraderFraction: number; // alpha in [0, 1]
  readonly orderHandlingCost: number;
  readonly riskFreeRate?: number;
}

export interface CopelandGalaiResult {
  readonly equilibriumSpread: number;
  readonly halfSpread: number;
  readonly callOptionLiability: number;
  readonly putOptionLiability: number;
  readonly uninformedRevenueRatio: number;
  readonly optimalBid: number;
  readonly optimalAsk: number;
}
