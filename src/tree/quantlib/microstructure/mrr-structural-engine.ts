import type { MrrStructuralParams, MrrStructuralResult } from './mrr-structural-types';

export function computeMrrStructuralSpread(p: MrrStructuralParams): MrrStructuralResult {
  const theta = Math.max(0, p.adverseSelection), phi = Math.max(1e-6, p.orderProcessingCost);
  const rho = Math.max(-0.999, Math.min(0.999, p.autocorrelation ?? 0));
  const halfSpread = phi + theta, spread = 2 * halfSpread;
  const adverseSelectionShare = theta / halfSpread, orderProcessingShare = phi / halfSpread;
  const innovations: number[] = [];
  let cumChange = 0;
  for (let t = 0; t < p.tradeSigns.length; t++) {
    const xt = p.tradeSigns[t]! >= 0 ? 1 : -1;
    const xPrev = t === 0 ? 0 : (p.tradeSigns[t - 1]! >= 0 ? 1 : -1);
    const dp = (phi + theta) * xt - (phi + rho * theta) * xPrev;
    innovations.push(dp);
    cumChange += dp;
  }
  return { spread, halfSpread, adverseSelectionShare, orderProcessingShare, predictedInnovations: innovations, cumulativePriceChange: cumChange };
}
