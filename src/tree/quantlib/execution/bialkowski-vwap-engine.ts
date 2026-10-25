export function computeBialkowskiVwap(p: BialkowskiVwapParams): BialkowskiVwapResult {
  const { totalShares: Q0, initialPrice: P0, intradayVolumeWeights: rawWeights } = p;
  const N = rawWeights.length;
  if (N === 0 || Q0 <= 0) {
    return { schedule: [], totalExecutionCost: 0, effectiveVWAP: P0, trackingErrorBps: 0 };
  }
  const sumW = rawWeights.reduce((a, b) => a + Math.max(0, b), 0);
  const weights = rawWeights.map(w => sumW > 1e-12 ? Math.max(0, w) / sumW : 1 / N);
  const eta = p.impactParam ?? 0.05, gamma = p.permImpactParam ?? 0.02;
  const schedule: VwapStep[] = [];
  let cumShares = 0, cumCost = 0, cumValue = 0;

  for (let k = 0; k < N; k++) {
    const wk = weights[k] ?? 1 / N;
    const qk = Q0 * wk;
    cumShares += qk;
    const rho = (qk / (Q0 / N)) / (wk + 1e-6);
    const impact = P0 * (gamma * (cumShares / Q0) + eta * Math.sqrt(Math.max(0, rho)));
    const price = Math.max(1e-4, P0 - impact);
    const stepCost = qk * (P0 - price);
    cumCost += stepCost;
    cumValue += qk * price;
    schedule.push({
      bucket: k + 1, scheduledShares: qk, remainingShares: Math.max(0, Q0 - cumShares),
      executionPrice: price, stepImpact: impact, stepCost,
    });
  }
  const effectiveVWAP = cumShares > 0 ? cumValue / cumShares : P0;
  const trackingErrorBps = (Math.abs(P0 - effectiveVWAP) / (P0 + 1e-9)) * 10000;
  return { schedule, totalExecutionCost: cumCost, effectiveVWAP, trackingErrorBps };
}

export interface VwapStep {
  bucket: number;
  scheduledShares: number;
  remainingShares: number;
  executionPrice: number;
  stepImpact: number;
  stepCost: number;
}

export interface BialkowskiVwapParams {
  totalShares: number;
  initialPrice: number;
  intradayVolumeWeights: number[];
  impactParam?: number;
  permImpactParam?: number;
}

export interface BialkowskiVwapResult {
  schedule: VwapStep[];
  totalExecutionCost: number;
  effectiveVWAP: number;
  trackingErrorBps: number;
}
