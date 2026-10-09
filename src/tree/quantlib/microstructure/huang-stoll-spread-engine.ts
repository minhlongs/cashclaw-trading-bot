import type { HuangStollDecompositionResult, HuangStollTradeTick } from './huang-stoll-spread-types';

export function computeHuangStollDecomposition(ticks: readonly HuangStollTradeTick[], spreadOverride?: number): HuangStollDecompositionResult {
  if (ticks.length < 3) {
    return { spread: 0, orderProcessingShare: 0, inventoryHoldingShare: 0, adverseSelectionShare: 0, tradeContinuationProb: 0.5 };
  }
  let sameCount = 0, priceDiffSum = 0, priceCount = 0;
  for (let i = 0; i < ticks.length; i++) {
    if (i > 0 && ticks[i].tradeDirection === ticks[i - 1].tradeDirection) sameCount++;
    if (ticks[i].price !== undefined) {
      priceDiffSum += ticks[i].tradeDirection * (ticks[i].price! - ticks[i].midpoint);
      priceCount++;
    }
  }
  const pi = sameCount / (ticks.length - 1);
  const rho = Math.max(-0.99, Math.min(0.99, 2 * pi - 1));
  const n = ticks.length - 2;
  let sumDpQ1 = 0, sumDpQ2 = 0;
  for (let i = 2; i < ticks.length; i++) {
    const dm = ticks[i].midpoint - ticks[i - 1].midpoint;
    sumDpQ1 += dm * ticks[i - 1].tradeDirection;
    sumDpQ2 += dm * ticks[i - 2].tradeDirection;
  }
  const det = Math.max(1e-6, 1 - rho * rho);
  const c1 = (sumDpQ1 / n - rho * (sumDpQ2 / n)) / det;
  const c2 = (sumDpQ2 / n - rho * (sumDpQ1 / n)) / det;
  const s = spreadOverride ? spreadOverride / 2 : (priceCount > 0 ? Math.max(1e-6, priceDiffSum / priceCount) : Math.max(1e-6, Math.abs(c1)));
  const betaRaw = Math.abs(rho) > 1e-4 ? -c2 / (rho * s) : 0;
  const beta = Math.max(0, Math.min(1, Number.isFinite(betaRaw) ? betaRaw : 0));
  const gammaRaw = c1 / s - beta;
  const gamma = Math.max(0, Math.min(1 - beta, Number.isFinite(gammaRaw) ? gammaRaw : 0));
  const alpha = Math.max(0, 1 - beta - gamma);

  return { spread: s * 2, orderProcessingShare: alpha, inventoryHoldingShare: beta, adverseSelectionShare: 1 - alpha - beta, tradeContinuationProb: pi };
}
