export function computeHubermanStanzlExecution(p: HubermanStanzlParams): HubermanStanzlResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.totalShares);
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n, p0 = Math.max(0, p.initialPrice);
  const gamma = p.permanentImpactCoeff, eta = Math.max(1e-6, p.temporaryImpactCoeff);
  const lambda = Math.max(0, p.riskAversion);
  const isManipulationFree = gamma >= 0;
  const quasiArbitrageMetric = isManipulationFree ? 0 : Math.abs(gamma) * s0;
  const trajectory: HubermanStanzlStep[] = [];
  let remaining = s0, cumExecuted = 0, totalNotional = 0, totalCost = 0;
  for (let i = 0; i < n; i++) {
    const stepsLeft = n - i;
    const baseSpeed = remaining / (stepsLeft * dt);
    const dampener = 1 / (1 + (lambda * dt) / (2 * eta));
    const targetSpeed = Math.max(0, baseSpeed * dampener);
    const tradeSize = i === n - 1 ? remaining : Math.min(remaining, Math.max(0, targetSpeed * dt));
    const tradeSpeed = dt > 0 ? tradeSize / dt : 0;
    cumExecuted += tradeSize;
    const permImpact = Math.max(0, gamma) * cumExecuted;
    const tempImpact = eta * tradeSpeed;
    const execPrice = p0 + permImpact + tempImpact;
    const stepCost = tradeSize * (permImpact + tempImpact) + lambda * (remaining ** 2) * dt;
    totalCost += stepCost;
    totalNotional += tradeSize * execPrice;
    remaining = Math.max(0, remaining - tradeSize);
    trajectory.push({ step: i + 1, sharesRemaining: remaining, tradeSize, tradeSpeed, permanentImpact: permImpact, temporaryImpact: tempImpact, executionPrice: execPrice, stepCost });
  }
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  return { trajectory, totalCost, vwapPrice, isManipulationFree, quasiArbitrageMetric, terminalShares: remaining };
}

export interface HubermanStanzlParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly permanentImpactCoeff: number;
  readonly temporaryImpactCoeff: number;
  readonly riskAversion: number;
  readonly initialPrice: number;
}

export interface HubermanStanzlStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSize: number;
  readonly tradeSpeed: number;
  readonly permanentImpact: number;
  readonly temporaryImpact: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface HubermanStanzlResult {
  readonly trajectory: readonly HubermanStanzlStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly isManipulationFree: boolean;
  readonly quasiArbitrageMetric: number;
  readonly terminalShares: number;
}
