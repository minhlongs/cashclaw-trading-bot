export function computeAlmgrenRiskPenalty(p: AlmgrenRiskPenaltyParams): AlmgrenRiskPenaltyResult {
  const x0 = p.totalShares, n = Math.max(1, p.horizonSteps);
  const eta = Math.max(1e-6, p.temporaryImpactEta), sigma = Math.max(1e-6, p.volatility);
  const lambda = Math.max(1e-6, p.riskAversion), power = Math.max(1, p.penaltyExponent ?? 1);
  const kappa = Math.sqrt((lambda * Math.pow(sigma, 2)) / eta);
  const trajectory: number[] = [];
  const sinhKT = Math.sinh(kappa * n);
  for (let t = 0; t <= n; t++) {
    const xt = sinhKT > 1e-8 ? x0 * (Math.sinh(kappa * (n - t)) / sinhKT) : x0 * (1 - t / n);
    trajectory.push(xt);
  }
  let expCost = 0, varAccum = 0;
  for (let t = 1; t <= n; t++) {
    const traded = trajectory[t - 1]! - trajectory[t]!;
    expCost += eta * Math.pow(traded, 2);
    varAccum += Math.pow(trajectory[t]!, 2) * Math.pow(sigma, 2);
  }
  const varCost = lambda * Math.pow(varAccum, power);
  return { trajectory, expectedCost: expCost, varianceCost: varCost, totalPenaltyCost: expCost + varCost, urgencyKappa: kappa };
}

export interface AlmgrenRiskPenaltyParams {
  readonly totalShares: number;
  readonly horizonSteps: number;
  readonly volatility: number;
  readonly riskAversion: number;
  readonly temporaryImpactEta: number;
  readonly penaltyExponent?: number;
}

export interface AlmgrenRiskPenaltyResult {
  readonly trajectory: readonly number[];
  readonly expectedCost: number;
  readonly varianceCost: number;
  readonly totalPenaltyCost: number;
  readonly urgencyKappa: number;
}
