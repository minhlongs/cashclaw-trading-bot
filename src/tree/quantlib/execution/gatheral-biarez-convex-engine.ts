export function computeGatheralBiarezConvexExecution(p: GatheralBiarezConvexParams): GatheralBiarezConvexResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const q0 = Math.max(0, p.initialShares), p0 = p.initialPrice;
  const alpha = Math.max(1.0, p.convexExponent ?? 1.5);
  const eta = Math.max(1e-6, p.impactParam ?? 0.1), gamma = Math.max(0, p.permImpactParam ?? 0.05);

  const trajectory: GatheralBiarezConvexStep[] = [];
  let remaining = q0, totalCost = 0, totalNotional = 0, cumulativeSold = 0, lastImpact = 0;

  for (let s = 0; s < n; s++) {
    const time = (s + 1) * dt, trade = s === n - 1 ? remaining : remaining / (n - s);
    cumulativeSold += trade;
    const vRate = dt > 0 ? trade / dt : 0;
    const benchmarkRate = t > 0 && q0 > 0 ? q0 / t : 1;
    const normVelocity = Math.max(0, vRate / benchmarkRate);

    const permImpact = p0 * gamma * (q0 > 0 ? cumulativeSold / q0 : 0);
    const tempImpact = p0 * eta * Math.pow(normVelocity, alpha);
    const totalStepImpact = Math.min(p0 * 0.9, permImpact + tempImpact);
    lastImpact = totalStepImpact;

    const execPrice = Math.max(1e-4, p0 - totalStepImpact), stepCost = trade * (p0 - execPrice);
    remaining = Math.max(0, remaining - trade);
    totalNotional += trade * execPrice;
    totalCost += stepCost;
    trajectory.push({ step: s + 1, time, sharesSold: trade, remainingShares: remaining, executionPrice: execPrice, stepCost, convexImpact: totalStepImpact });
  }

  const vwap = q0 > 0 ? totalNotional / q0 : p0;
  return { trajectory, totalExecutionCost: totalCost, averageExecutionPrice: vwap, terminalShares: remaining, terminalImpact: lastImpact };
}

export interface GatheralBiarezConvexParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly convexExponent?: number;
  readonly impactParam?: number;
  readonly permImpactParam?: number;
}

export interface GatheralBiarezConvexStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly convexImpact: number;
}

export interface GatheralBiarezConvexResult {
  readonly trajectory: readonly GatheralBiarezConvexStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly terminalImpact: number;
}
