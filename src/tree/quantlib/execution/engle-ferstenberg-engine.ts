import type { EngleFerstenbergParams, EngleFerstenbergResult, EngleFerstenbergStep } from './engle-ferstenberg-types';

export function executeEngleFerstenbergExecution(p: EngleFerstenbergParams): EngleFerstenbergResult {
  const q0 = Math.max(0, p.totalShares), p0 = Math.max(1e-4, p.initialPrice), n = Math.max(1, p.numBuckets ?? 5);
  const lambda = Math.max(1e-6, p.riskAversion ?? 0.05), sigma = Math.max(1e-4, p.volatility ?? 0.02);
  const vTotal = Math.max(1, p.marketVolume ?? 100_000), gamma = Math.max(1e-5, p.permImpactParam ?? 0.01), eta = Math.max(1e-5, p.tempImpactParam ?? 0.05);
  const kappa = Math.sqrt((lambda * sigma * sigma) / eta);
  const sinhKn = Math.sinh(kappa * n) || 1;
  const rawWeights = Array.from({ length: n }, (_, k) => 2 * Math.sinh(kappa / 2) * Math.cosh(kappa * (n - (k + 0.5))) / sinhKn);
  const sumW = rawWeights.reduce((a, b) => a + b, 0) || 1;
  let rem = q0, cumTrade = 0, totalCost = 0, totalNotional = 0, totalVar = 0;
  const schedule: EngleFerstenbergStep[] = [];
  for (let k = 0; k < n; k++) {
    const qk = k === n - 1 ? rem : Math.min(rem, (rawWeights[k] / sumW) * q0);
    cumTrade += qk;
    const permImp = p0 * gamma * (cumTrade / vTotal), tempImp = p0 * eta * (qk / (vTotal / n));
    const stepImpact = permImp + tempImp, execPrice = Math.max(1e-4, p0 - stepImpact), stepCost = qk * (p0 - execPrice);
    rem = Math.max(0, rem - qk); totalNotional += qk * execPrice; totalCost += stepCost;
    const volRisk = 0.5 * lambda * sigma * sigma * (rem * rem) * p0; totalVar += volRisk;
    schedule.push({ bucket: k + 1, sharesTraded: qk, remainingShares: rem, executionPrice: execPrice, stepImpact, stepCost, volatilityRisk: volRisk });
  }
  const effectivePrice = q0 > 0 ? totalNotional / q0 : p0;
  const isBps = (Math.max(0, p0 - effectivePrice) / p0) * 10_000;
  return { schedule, totalExecutionCost: totalCost, effectivePrice, implementationShortfallBps: isBps, totalRiskVariance: totalVar };
}
