export function computeCopelandGalaiSpread(p: CopelandGalaiParams): CopelandGalaiResult {
  const s0 = Math.max(1e-4, p.assetPrice), sigma = Math.max(1e-5, p.volatility);
  const tauYears = Math.max(1e-6, p.timeToQuoteExpirySec / (365.25 * 86400));
  const alpha = Math.min(0.99, Math.max(0.01, p.informedTraderFraction));
  const cOrder = Math.max(0, p.orderHandlingCost);

  // Black-Scholes/Bachelier at-the-money straddle approximation: C ~ P ~ S0 * sigma * sqrt(tau / (2*pi))
  const atmOption = (s0 * sigma * Math.sqrt(tauYears)) / Math.sqrt(2 * Math.PI);
  const callOptionLiability = atmOption;
  const putOptionLiability = atmOption;
  const totalDealerOptionLiability = callOptionLiability + putOptionLiability;

  // Zero-profit condition: (1 - alpha) * (halfSpread) = alpha * optionLiability + cOrder
  const uninformedFraction = 1 - alpha;
  const halfSpread = (alpha * totalDealerOptionLiability + cOrder) / Math.max(0.01, uninformedFraction);
  const equilibriumSpread = 2 * halfSpread;
  const optimalBid = Math.max(1e-4, s0 - halfSpread);
  const optimalAsk = s0 + halfSpread;
  const uninformedRevenueRatio = halfSpread / Math.max(1e-6, totalDealerOptionLiability);

  return { equilibriumSpread, halfSpread, callOptionLiability, putOptionLiability, uninformedRevenueRatio, optimalBid, optimalAsk };
}

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
