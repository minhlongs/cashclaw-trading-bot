export function computeMRRDecomposition(ticks: readonly MRRTradeTick[]): MRRDecompositionResult {
  if (ticks.length < 3) {
    return { spread: 0, adverseSelectionShare: 0, orderProcessingShare: 0, orderPersistence: 0, residualVariance: 0 };
  }

  const n = ticks.length - 1;
  let sumDpX = 0;
  let sumXlagX = 0;
  let sumDpXlag = 0;

  for (let i = 1; i < ticks.length; i++) {
    const dp = ticks[i].price - ticks[i - 1].price;
    const x = ticks[i].tradeDirection;
    const xLag = ticks[i - 1].tradeDirection;

    sumDpX += dp * x;
    sumXlagX += x * xLag;
    sumDpXlag += dp * xLag;
  }

  const rho = Math.max(-0.99, Math.min(0.99, sumXlagX / n));
  const s = Math.max(1e-6, (sumDpX - rho * sumDpXlag) / (n * (1 - rho * rho)));
  const thetaEst = (sumDpXlag - rho * sumDpX) / (n * s * (rho * rho - 1));
  const adverseSelectionShare = Math.max(0, Math.min(1, Number.isFinite(thetaEst) ? thetaEst : 0.5));
  const orderProcessingShare = Math.max(0, Math.min(1, 1 - adverseSelectionShare));

  let resSum = 0;
  for (let i = 1; i < ticks.length; i++) {
    const dp = ticks[i].price - ticks[i - 1].price;
    const x = ticks[i].tradeDirection;
    const xLag = ticks[i - 1].tradeDirection;
    const fitted = (adverseSelectionShare + orderProcessingShare) * s * x - (orderProcessingShare + adverseSelectionShare * rho) * s * xLag;
    resSum += (dp - fitted) * (dp - fitted);
  }

  return {
    spread: Math.max(0, s * 2),
    adverseSelectionShare,
    orderProcessingShare,
    orderPersistence: rho,
    residualVariance: resSum / n,
  };
}

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
