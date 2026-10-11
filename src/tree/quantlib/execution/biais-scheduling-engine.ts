import type { BiaisSchedulingParams, BiaisSchedulingResult, BiaisSchedulingStep } from './biais-scheduling-types';

export function executeBiaisScheduling(p: BiaisSchedulingParams): BiaisSchedulingResult {
  const q0 = Math.max(0, p.totalShares), p0 = Math.max(1e-4, p.initialPrice), n = Math.max(1, p.numBuckets ?? 10);
  const alpha = Math.max(0, Math.min(0.99, p.informedArrivalProb ?? 0.2)), theta = Math.max(0, p.adverseIntensity ?? 0.03);
  const mu = Math.max(0, p.latencyCostRate ?? 0.001), gamma = Math.max(1e-5, p.baseImpact ?? 0.02);
  const decayWeights = Array.from({ length: n }, (_, k) => Math.exp(-alpha * (k / n)));
  const sumW = decayWeights.reduce((a, b) => a + b, 0) || 1;
  const targetSlices = decayWeights.map((w) => (w / sumW) * q0);
  let rem = q0, cumTrade = 0, totalCost = 0, totalNotional = 0;
  const schedule: BiaisSchedulingStep[] = [];
  for (let k = 0; k < n; k++) {
    const qk = k === n - 1 ? rem : Math.min(rem, targetSlices[k]);
    cumTrade += qk;
    const advImp = theta * alpha * (cumTrade / Math.max(1e-4, q0));
    const latPenalty = mu * k * p0;
    const stepImpact = p0 * (gamma * (qk / Math.max(1e-4, q0)) + advImp) + latPenalty;
    const execPrice = Math.max(1e-4, p0 - stepImpact), stepCost = qk * (p0 - execPrice);
    rem = Math.max(0, rem - qk); totalNotional += qk * execPrice; totalCost += stepCost;
    schedule.push({ bucket: k + 1, sharesTraded: qk, remainingShares: rem, executionPrice: execPrice, stepCost, informedAdverseImpact: advImp * p0, latencyPenalty: latPenalty });
  }
  const effectivePrice = q0 > 0 ? totalNotional / q0 : p0;
  const isBps = (Math.max(0, p0 - effectivePrice) / p0) * 10_000;
  return { schedule, totalExecutionCost: totalCost, effectivePrice, implementationShortfallBps: isBps };
}
