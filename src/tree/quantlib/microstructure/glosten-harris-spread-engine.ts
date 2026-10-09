import type {
  GlostenHarrisDecompositionResult,
  GlostenHarrisTradeTick,
} from './glosten-harris-spread-types';

export function computeGlostenHarrisDecomposition(
  ticks: readonly GlostenHarrisTradeTick[],
): GlostenHarrisDecompositionResult {
  const empty: GlostenHarrisDecompositionResult = {
    spread: 0, halfSpread: 0, orderProcessingCost: 0, adverseSelectionCost: 0,
    orderProcessingShare: 0, adverseSelectionShare: 0, rSquared: 0,
  };
  if (ticks.length < 3) return empty;

  let sXX00 = 0, sXX01 = 0, sXX11 = 0, sXY0 = 0, sXY1 = 0, sYY = 0;
  for (let i = 1; i < ticks.length; i++) {
    const dp = ticks[i].price - ticks[i - 1].price;
    const dq = ticks[i].tradeDirection - ticks[i - 1].tradeDirection;
    const q = ticks[i].tradeDirection;
    sXX00 += dq * dq; sXX01 += dq * q; sXX11 += q * q;
    sXY0 += dq * dp; sXY1 += q * dp; sYY += dp * dp;
  }

  const det = sXX00 * sXX11 - sXX01 * sXX01;
  if (Math.abs(det) < 1e-12) return empty;

  const c = Math.max(0, (sXX11 * sXY0 - sXX01 * sXY1) / det);
  const z = Math.max(0, (sXX00 * sXY1 - sXX01 * sXY0) / det);
  const halfSpread = c + z;

  let ssRes = 0;
  for (let i = 1; i < ticks.length; i++) {
    const dp = ticks[i].price - ticks[i - 1].price;
    const dq = ticks[i].tradeDirection - ticks[i - 1].tradeDirection;
    const res = dp - (c * dq + z * ticks[i].tradeDirection);
    ssRes += res * res;
  }

  const rSquared = sYY > 1e-12 ? Math.max(0, Math.min(1, 1 - ssRes / sYY)) : 0;
  const adverseSelectionShare = halfSpread > 1e-8 ? z / halfSpread : 0.5;

  return {
    spread: halfSpread * 2, halfSpread,
    orderProcessingCost: c, adverseSelectionCost: z,
    orderProcessingShare: 1 - adverseSelectionShare, adverseSelectionShare,
    rSquared,
  };
}
