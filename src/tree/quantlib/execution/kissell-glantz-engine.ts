export function computeKissellGlantzExecution(p: KissellGlantzParams): KissellGlantzResult {
  const q0 = Math.max(0, p.totalShares), p0 = Math.max(1e-4, p.initialPrice), n = Math.max(1, p.numBuckets ?? 5);
  const adv = Math.max(1, p.adv ?? 100_000), sigma = Math.max(1e-4, p.volatility ?? 0.02);
  const lambda = Math.max(0, p.riskAversion ?? 0.05), a1 = Math.max(1e-4, p.a1 ?? 0.5);
  const a2 = Math.max(0.1, p.a2 ?? 0.5), a3 = Math.max(0.1, p.a3 ?? 0.8), gamma = Math.max(0, p.permImpact ?? 0.01);
  const rawWeights = Array.from({ length: n }, (_, k) => Math.exp(-lambda * (k / n)));
  const sumW = rawWeights.reduce((a, b) => a + b, 0) || 1;
  let rem = q0, cumTrade = 0, totalCost = 0, totalNotional = 0, totalVar = 0;
  const schedule: KissellGlantzStep[] = [];
  for (let k = 0; k < n; k++) {
    const qk = k === n - 1 ? rem : Math.min(rem, (rawWeights[k] / sumW) * q0);
    cumTrade += qk;
    const vRate = qk / (adv / n);
    const instImpact = p0 * (a1 * Math.pow(vRate, a2) * Math.pow(sigma, a3) + gamma * (cumTrade / Math.max(1, q0)));
    const execPrice = Math.max(1e-4, p0 - instImpact), stepCost = qk * (p0 - execPrice);
    rem = Math.max(0, rem - qk); totalNotional += qk * execPrice; totalCost += stepCost;
    const varRisk = sigma * sigma * (rem * rem) * (1 / n); totalVar += varRisk;
    schedule.push({ bucket: k + 1, sharesTraded: qk, remainingShares: rem, executionPrice: execPrice, stepImpact: instImpact, stepCost, varianceRisk: varRisk });
  }
  const effectivePrice = q0 > 0 ? totalNotional / q0 : p0;
  const isBps = (Math.max(0, p0 - effectivePrice) / p0) * 10_000;
  return { schedule, totalExecutionCost: totalCost, effectivePrice, implementationShortfallBps: isBps, totalVariance: totalVar, frontierUtility: totalCost + lambda * totalVar };
}

export interface KissellGlantzStep {
  readonly bucket: number;
  readonly sharesTraded: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepImpact: number;
  readonly stepCost: number;
  readonly varianceRisk: number;
}

export interface KissellGlantzParams {
  readonly totalShares: number;
  readonly initialPrice: number;
  readonly adv?: number;
  readonly volatility?: number;
  readonly riskAversion?: number;
  readonly numBuckets?: number;
  readonly a1?: number;
  readonly a2?: number;
  readonly a3?: number;
  readonly permImpact?: number;
}

export interface KissellGlantzResult {
  readonly schedule: readonly KissellGlantzStep[];
  readonly totalExecutionCost: number;
  readonly effectivePrice: number;
  readonly implementationShortfallBps: number;
  readonly totalVariance: number;
  readonly frontierUtility: number;
}
