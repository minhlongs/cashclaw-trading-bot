export function executeKonishiBrowne(p: KonishiBrowneParams): KonishiBrowneResult {
  const q0 = Math.max(0, p.totalShares), p0 = Math.max(1e-4, p.initialPrice);
  const rawW = p.volumeWeights.length > 0 ? p.volumeWeights : [1];
  const wSum = rawW.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const w = rawW.map((v) => Math.max(0, v) / wSum), n = w.length;
  const lambda = Math.max(0, p.riskAversion ?? 0.1), sigma = Math.max(1e-4, p.volatility ?? 0.02);
  const eta = Math.max(1e-5, p.temporaryImpact ?? 0.05), gamma = Math.max(0, p.permanentImpact ?? 0.02);
  const decay = w.map((wk, k) => wk / (1 + lambda * sigma * sigma * ((n - k) / n)));
  const decaySum = decay.reduce((a, b) => a + b, 0) || 1;
  const normSlices = decay.map((d) => (d / decaySum) * q0);
  let rem = q0, cumTrade = 0, totalCost = 0, totalNotional = 0;
  const schedule: KonishiBrowneStep[] = [];
  for (let k = 0; k < n; k++) {
    const qk = k === n - 1 ? rem : Math.min(rem, normSlices[k]);
    cumTrade += qk;
    const impact = p0 * (gamma * (cumTrade / Math.max(1e-4, q0)) + eta * (qk / (w[k] * q0 + 1e-6)));
    const price = Math.max(1e-4, p0 - impact), stepCost = qk * (p0 - price);
    rem = Math.max(0, rem - qk); totalNotional += qk * price; totalCost += stepCost;
    schedule.push({ bucket: k + 1, scheduledShares: qk, remainingShares: rem, executionPrice: price, stepCost, impactPenalty: impact });
  }
  const effectiveVWAP = q0 > 0 ? totalNotional / q0 : p0, benchVWAP = p0;
  const trackingErrorBps = (Math.abs(effectiveVWAP - benchVWAP) / benchVWAP) * 10_000;
  return { schedule, totalExecutionCost: totalCost, effectiveVWAP, trackingErrorBps, benchmarkVWAP: benchVWAP };
}

export interface KonishiBrowneParams {
  totalShares: number;
  initialPrice: number;
  volumeWeights: number[];
  riskAversion?: number;
  volatility?: number;
  temporaryImpact?: number;
  permanentImpact?: number;
}

export interface KonishiBrowneStep {
  bucket: number;
  scheduledShares: number;
  remainingShares: number;
  executionPrice: number;
  stepCost: number;
  impactPenalty: number;
}

export interface KonishiBrowneResult {
  schedule: KonishiBrowneStep[];
  totalExecutionCost: number;
  effectiveVWAP: number;
  trackingErrorBps: number;
  benchmarkVWAP: number;
}
