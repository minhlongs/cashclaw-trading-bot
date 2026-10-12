import type { BipowerJumpResult } from './bipower-jump-types';

export function runBipowerJumpEstimation(returns: readonly number[], alpha = 0.05): BipowerJumpResult {
  const n = returns.length;
  if (n < 3) throw new Error('Bipower jump detection requires at least 3 return observations.');
  let rv = 0;
  for (const r of returns) rv += r * r;
  let bvSum = 0;
  for (let i = 1; i < n; i++) bvSum += Math.abs(returns[i]) * Math.abs(returns[i - 1]);
  const bv = (Math.PI / 2) * (n / (n - 1)) * bvSum;
  const jumpVar = Math.max(0, rv - bv);
  const relJumpRatio = rv > 0 ? jumpVar / rv : 0;
  const theta = (Math.PI * Math.PI) / 4 + Math.PI - 3;
  const se = Math.sqrt(Math.max(1e-12, theta / n));
  const zScore = relJumpRatio / se;
  const criticalVal = alpha <= 0.01 ? 2.326 : 1.645;
  return {
    realizedVariance: Number(rv.toFixed(8)),
    bipowerVariation: Number(bv.toFixed(8)),
    jumpVariation: Number(jumpVar.toFixed(8)),
    relativeJumpRatio: Number(relJumpRatio.toFixed(6)),
    zScore: Number(zScore.toFixed(4)),
    hasSignificantJump: zScore > criticalVal,
    sampleCount: n,
  };
}
