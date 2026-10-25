export function computeGatheralRoughExecution(p: GatheralRoughExecutionParams): GatheralRoughExecutionResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const q0 = Math.max(0, p.initialShares), p0 = p.initialPrice;
  const h = Math.min(0.499, Math.max(0.01, p.hurstParameter ?? 0.14)), alpha = h + 0.5;
  const lambda = Math.max(1e-6, p.impactParam ?? 0.1), dtAlpha = Math.pow(dt, alpha);

  const trajectory: GatheralRoughExecutionStep[] = [], rates: number[] = [];
  let remaining = q0, totalCost = 0, totalNotional = 0, lastImpact = 0;

  for (let s = 0; s < n; s++) {
    const time = (s + 1) * dt, trade = s === n - 1 ? remaining : remaining / (n - s);
    const rate = dt > 0 ? trade / dt : 0;
    rates.push(rate);

    let impactFraction = 0;
    for (let j = 0; j <= s; j++) {
      const kernelWeight = Math.pow(s - j + 1, alpha) - Math.pow(s - j, alpha);
      impactFraction += lambda * (rates[j]! / (q0 > 0 ? q0 : 1)) * kernelWeight * dtAlpha;
    }
    const impact = p0 * Math.min(0.5, impactFraction);
    lastImpact = impact;

    const execPrice = Math.max(1e-4, p0 - impact), stepCost = trade * (p0 - execPrice);
    remaining = Math.max(0, remaining - trade);
    totalNotional += trade * execPrice;
    totalCost += stepCost;
    trajectory.push({ step: s + 1, time, sharesSold: trade, remainingShares: remaining, executionPrice: execPrice, stepCost, roughImpact: impact });
  }

  const vwap = q0 > 0 ? totalNotional / q0 : p0;
  return { trajectory, totalExecutionCost: totalCost, averageExecutionPrice: vwap, terminalShares: remaining, terminalImpact: lastImpact };
}

export interface GatheralRoughExecutionParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly hurstParameter?: number;
  readonly impactParam?: number;
}

export interface GatheralRoughExecutionStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly roughImpact: number;
}

export interface GatheralRoughExecutionResult {
  readonly trajectory: readonly GatheralRoughExecutionStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly terminalImpact: number;
}
