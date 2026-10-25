export function computeBertsimasLoExecution(p: BertsimasLoParams): BertsimasLoExecutionResult {
  const n = Math.max(1, Math.floor(p.numSteps));
  const s = Math.max(0, p.totalShares);
  const eta = Math.max(1e-6, p.temporaryImpactEta);
  const gamma = Math.max(0, p.permanentImpactGamma ?? 0);
  const sigma = Math.max(0, p.volatility ?? 0);
  const lambda = Math.max(0, p.riskAversion ?? 0);

  const kappa = Math.sqrt((lambda * sigma * sigma) / eta);
  const sinhKT = Math.sinh(kappa * n);
  const trajectory: BertsimasLoStep[] = [];
  let remaining = s;
  let tempCostSum = 0;
  let variance = 0;

  for (let k = 0; k < n; k++) {
    const target = k === n - 1 ? 0 : (sinhKT > 1e-8 ? s * (Math.sinh(kappa * (n - (k + 1))) / sinhKT) : s * (1 - (k + 1) / n));
    const tradeSize = remaining - target;
    const stepCost = eta * tradeSize * tradeSize + gamma * tradeSize * (remaining - tradeSize / 2);
    tempCostSum += eta * tradeSize * tradeSize;
    remaining = target;
    variance += sigma * sigma * remaining * remaining;
    trajectory.push({ step: k + 1, tradeSize, remainingShares: remaining, stepCost });
  }

  const permCost = 0.5 * gamma * s * s;
  const expectedCost = permCost + tempCostSum;
  const twapCost = permCost + (eta * s * s) / n;
  const immediateCost = permCost + eta * s * s;
  const impactSavings = Math.max(0, immediateCost - expectedCost);

  return { trajectory, expectedCost, twapCost, immediateCost, impactSavings, variance };
}

export interface BertsimasLoParams {
  readonly totalShares: number;
  readonly numSteps: number;
  readonly temporaryImpactEta: number;
  readonly permanentImpactGamma?: number;
  readonly volatility?: number;
  readonly riskAversion?: number;
}

export interface BertsimasLoStep {
  readonly step: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly stepCost: number;
}

export interface BertsimasLoExecutionResult {
  readonly trajectory: readonly BertsimasLoStep[];
  readonly expectedCost: number;
  readonly twapCost: number;
  readonly immediateCost: number;
  readonly impactSavings: number;
  readonly variance: number;
}
