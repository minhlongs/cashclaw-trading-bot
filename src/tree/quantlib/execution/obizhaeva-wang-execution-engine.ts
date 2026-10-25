export function computeObizhaevaWangExecution(p: ObizhaevaWangParams): ObizhaevaWangExecutionResult {
  const n = Math.max(1, Math.floor(p.numSteps));
  const s = Math.max(0, p.totalShares);
  const dt = Math.max(1e-4, p.timeStep ?? 1.0);
  const rho = Math.max(0, p.resilienceRate);
  const lambda = 1 / Math.max(1e-6, p.orderBookDepth ?? 1000);
  const kappa = Math.exp(-rho * dt);

  const denom = n <= 1 ? 1 : Math.max(1e-6, 2 + (n - 2) * (1 - kappa));
  const block0 = n <= 1 ? s : s / denom;
  const interm = n <= 2 ? 0 : block0 * (1 - kappa);

  const trajectory: ObizhaevaWangStep[] = [];
  let remaining = s, currentImpact = 0, totalCost = 0;

  for (let k = 0; k < n; k++) {
    const size = k === 0 || k === n - 1 ? (n === 1 ? s : block0) : interm;
    const priorImpact = currentImpact * kappa;
    const stepCost = (priorImpact + 0.5 * lambda * size) * size;
    currentImpact = priorImpact + lambda * size;
    remaining = Math.max(0, remaining - size);
    totalCost += stepCost;
    trajectory.push({ step: k + 1, tradeSize: size, remainingShares: remaining, impactLevel: currentImpact, stepCost });
  }

  const twapSize = s / n;
  let twapImpact = 0, twapCost = 0;
  for (let k = 0; k < n; k++) {
    const prior = twapImpact * kappa;
    twapCost += (prior + 0.5 * lambda * twapSize) * twapSize;
    twapImpact = prior + lambda * twapSize;
  }

  const immediateCost = 0.5 * lambda * s * s;
  return { trajectory, expectedCost: totalCost, twapCost, immediateCost, impactSavings: Math.max(0, immediateCost - totalCost), resilienceFactor: kappa };
}

export interface ObizhaevaWangParams {
  readonly totalShares: number;
  readonly numSteps: number;
  readonly resilienceRate: number;
  readonly timeStep?: number;
  readonly orderBookDepth?: number;
}

export interface ObizhaevaWangStep {
  readonly step: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly impactLevel: number;
  readonly stepCost: number;
}

export interface ObizhaevaWangExecutionResult {
  readonly trajectory: readonly ObizhaevaWangStep[];
  readonly expectedCost: number;
  readonly twapCost: number;
  readonly immediateCost: number;
  readonly impactSavings: number;
  readonly resilienceFactor: number;
}
