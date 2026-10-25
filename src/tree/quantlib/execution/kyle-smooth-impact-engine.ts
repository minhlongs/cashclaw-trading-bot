export function computeKyleSmoothImpactExecution(p: KyleSmoothImpactParams): KyleSmoothImpactResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const q0 = Math.max(0, p.initialShares), p0 = p.initialPrice;
  const beta = Math.max(1e-4, p.dissipationRate ?? 2.0), lambda = Math.max(1e-6, p.impactParam ?? 0.1);

  const trajectory: KyleSmoothImpactStep[] = [];
  let remaining = q0, currentImpact = 0, totalCost = 0, totalNotional = 0;

  for (let s = 0; s < n; s++) {
    const time = (s + 1) * dt, trade = s === n - 1 ? remaining : remaining / (n - s);
    const rate = dt > 0 ? trade / dt : 0;
    const decay = Math.exp(-beta * dt);
    const impulse = (lambda * rate * (1.0 - decay)) / beta;
    currentImpact = currentImpact * decay + impulse;

    const execPrice = Math.max(1e-4, p0 - currentImpact);
    const stepCost = trade * (p0 - execPrice);
    remaining = Math.max(0, remaining - trade);
    totalNotional += trade * execPrice;
    totalCost += stepCost;
    trajectory.push({ step: s + 1, time, sharesSold: trade, remainingShares: remaining, executionPrice: execPrice, stepCost, smoothImpact: currentImpact });
  }

  const vwap = q0 > 0 ? totalNotional / q0 : p0;
  return { trajectory, totalExecutionCost: totalCost, averageExecutionPrice: vwap, terminalShares: remaining, terminalImpact: currentImpact };
}

export interface KyleSmoothImpactParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly dissipationRate?: number; // beta, default 2.0
  readonly impactParam?: number; // lambda, default 0.1
}

export interface KyleSmoothImpactStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly smoothImpact: number;
}

export interface KyleSmoothImpactResult {
  readonly trajectory: readonly KyleSmoothImpactStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly terminalImpact: number;
}
