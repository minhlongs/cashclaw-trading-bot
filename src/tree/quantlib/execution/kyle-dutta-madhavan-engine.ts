export function computeKyleDuttaMadhavanExecution(p: KyleDuttaMadhavanParams): KyleDuttaMadhavanResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.totalShares);
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n, m = Math.max(1, Math.floor(p.numDealers));
  const lam0 = Math.max(1e-6, p.adverseSelectionBase), lamEff = lam0 / m;
  const eta = Math.max(1e-6, p.impactParam), gamma = Math.max(0, p.dealerRiskAversion);
  const phi = Math.max(0, p.traderRiskAversion);
  const trajectory: KyleDuttaMadhavanStep[] = [];
  let remaining = s0, totalCost = 0;
  for (let i = 0; i < n; i++) {
    const stepsLeft = n - i;
    const baseSpeed = remaining / (stepsLeft * dt);
    const dampener = 1 / (1 + (gamma * m) / (2 * eta + lamEff));
    const targetSpeed = Math.max(0, baseSpeed * dampener);
    const tradeSize = i === n - 1 ? remaining : Math.min(remaining, Math.max(0, targetSpeed * dt));
    const tradeSpeed = dt > 0 ? tradeSize / dt : 0;
    const impactCost = (eta + lamEff) * (tradeSpeed ** 2) * dt;
    const riskCost = phi * (remaining ** 2) * dt;
    const stepCost = impactCost + riskCost;
    totalCost += stepCost;
    remaining = Math.max(0, remaining - tradeSize);
    trajectory.push({ step: i + 1, sharesRemaining: remaining, tradeSpeed, tradeSize, effectiveLambda: lamEff, stepCost });
  }
  const twapSize = s0 / n, twapSpeed = twapSize / dt;
  let twapCost = 0, twapRem = s0;
  for (let i = 0; i < n; i++) {
    twapCost += ((eta + lam0) * (twapSpeed ** 2) + phi * (twapRem ** 2)) * dt;
    twapRem = Math.max(0, twapRem - twapSize);
  }
  return { trajectory, expectedCost: totalCost, benchmarkTwapCost: twapCost, costSavings: Math.max(0, twapCost - totalCost), terminalShares: remaining };
}

export interface KyleDuttaMadhavanParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly numDealers: number;
  readonly dealerRiskAversion: number;
  readonly adverseSelectionBase: number;
  readonly traderRiskAversion: number;
  readonly impactParam: number;
}

export interface KyleDuttaMadhavanStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly effectiveLambda: number;
  readonly stepCost: number;
}

export interface KyleDuttaMadhavanResult {
  readonly trajectory: readonly KyleDuttaMadhavanStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly costSavings: number;
  readonly terminalShares: number;
}
