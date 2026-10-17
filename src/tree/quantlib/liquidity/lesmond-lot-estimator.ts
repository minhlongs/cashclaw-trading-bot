import type { LesmondLotResult } from './lesmond-lot-types';

const SQRT2PI = Math.sqrt(2 * Math.PI);

function probitApprox(p: number): number {
  const c = Math.max(0.5001, Math.min(0.9999, p));
  return SQRT2PI * (c - 0.5) * (1 + 0.35 * Math.pow(c - 0.5, 2));
}

export function runLesmondLot(returns: readonly number[], tol: number): LesmondLotResult {
  const n = returns.length;
  let zeroCount = 0, posSum = 0, posCount = 0, negSum = 0, negCount = 0, sqSum = 0;
  for (const r of returns) {
    sqSum += r * r;
    if (Math.abs(r) <= tol) zeroCount++;
    else if (r > tol) { posSum += r; posCount++; }
    else { negSum += Math.abs(r); negCount++; }
  }
  const zrp = zeroCount / n;
  const sigma = Math.max(1e-6, Math.sqrt(sqSum / Math.max(1, n - zeroCount)));
  const halfProb = 0.5 * (1 + zrp);
  const baseThreshold = zrp > 0 ? sigma * probitApprox(halfProb) : 0;
  const posBias = posCount > 0 && negCount > 0 ? (posSum / posCount) / ((posSum / posCount + negSum / negCount) / 2) : 1;
  const alpha2 = baseThreshold * Math.min(1.5, Math.max(0.5, posBias));
  const alpha1 = -Math.max(0, 2 * baseThreshold - alpha2);
  return {
    zeroReturnProportion: Number(zrp.toFixed(6)),
    buyThresholdAlpha2: Number(alpha2.toFixed(6)),
    sellThresholdAlpha1: Number(alpha1.toFixed(6)),
    roundTripCost: Number((alpha2 - alpha1).toFixed(6)),
    latentVolatility: Number(sigma.toFixed(6)),
    sampleDays: n,
  };
}
