export function computeLehalleVolumeCurve(p: LehalleVolumeCurveParams): LehalleVolumeCurveResult {
  const q0 = Math.max(0, p.totalShares), p0 = Math.max(1e-4, p.initialPrice);
  const eta = Math.max(1e-6, p.temporaryImpact ?? 0.05), lambda = Math.max(0, p.trackingAversion ?? 0.5);
  const curve = p.volumeCurve.length > 0 ? p.volumeCurve : [1];
  const t = curve.length, sumVol = curve.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const weights = curve.map((v) => Math.max(0, v) / sumVol);
  let rem = q0, totalCost = 0, totalNotional = 0, sumSqError = 0;
  const schedule: LehalleVolumeCurveStep[] = [];
  for (let k = 0; k < t; k++) {
    const rawFrac = (lambda * weights[k]! + eta / t) / (eta + lambda);
    const qk = k === t - 1 ? rem : Math.min(rem, rawFrac * q0);
    const impact = p0 * eta * (qk / Math.max(1, q0));
    const execPrice = Math.max(1e-4, p0 - impact), stepCost = qk * (p0 - execPrice);
    rem = Math.max(0, rem - qk); totalNotional += qk * execPrice; totalCost += stepCost;
    const errBps = Math.abs(qk / Math.max(1, q0) - weights[k]!) * 10_000;
    sumSqError += Math.pow(qk - weights[k]! * q0, 2);
    schedule.push({ step: k + 1, targetFraction: weights[k]!, allocatedShares: qk, remainingShares: rem, executionPrice: execPrice, trackingErrorBps: errBps, stepCost });
  }
  const effPrice = q0 > 0 ? totalNotional / q0 : p0;
  const vwapErrBps = (Math.sqrt(sumSqError) / Math.max(1, q0)) * 10_000;
  return { schedule, totalCost, effectivePrice: effPrice, vwapTrackingErrorBps: vwapErrBps, objectiveUtility: totalCost + lambda * sumSqError };
}

export interface LehalleVolumeCurveStep {
  readonly step: number;
  readonly targetFraction: number;
  readonly allocatedShares: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly trackingErrorBps: number;
  readonly stepCost: number;
}

export interface LehalleVolumeCurveParams {
  readonly totalShares: number;
  readonly volumeCurve: readonly number[];
  readonly initialPrice: number;
  readonly temporaryImpact?: number;
  readonly trackingAversion?: number;
  readonly volatility?: number;
}

export interface LehalleVolumeCurveResult {
  readonly schedule: readonly LehalleVolumeCurveStep[];
  readonly totalCost: number;
  readonly effectivePrice: number;
  readonly vwapTrackingErrorBps: number;
  readonly objectiveUtility: number;
}
