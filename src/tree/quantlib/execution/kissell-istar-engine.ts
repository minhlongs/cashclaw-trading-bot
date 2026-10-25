export function computeKissellIStarExecution(p: KissellIStarParams): KissellIStarResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const q0 = Math.max(0, p.initialShares), p0 = p.initialPrice, adv = Math.max(1, p.dailyVolume ?? 1_000_000);
  const sigma = Math.max(1e-4, p.dailyVolatility ?? 0.02);
  const a1 = p.impactFactor ?? 0.25, a2 = p.sizeExponent ?? 0.5, a3 = p.volatilityExponent ?? 1.0;
  const b1 = p.stepImpactFactor ?? 0.35, b2 = p.rateExponent ?? 0.5;

  const orderFraction = q0 / adv;
  const iStar = a1 * Math.pow(orderFraction, a2) * Math.pow(sigma, a3) * p0;
  const trajectory: KissellIStarStep[] = [];
  let remaining = q0, totalCost = 0, totalNotional = 0, cumSold = 0;

  for (let s = 0; s < n; s++) {
    const time = (s + 1) * dt, trade = s === n - 1 ? remaining : remaining / (n - s);
    cumSold += trade;
    const partRate = trade / (dt * adv);
    const stepImpact = b1 * Math.pow(Math.max(0, partRate), b2) * sigma * p0;
    const permImpact = (cumSold / Math.max(1e-4, q0)) * (iStar * 0.5);
    const execPrice = Math.max(1e-4, p0 - permImpact - stepImpact);
    const stepCost = trade * (p0 - execPrice);
    remaining = Math.max(0, remaining - trade);
    totalNotional += trade * execPrice;
    totalCost += stepCost;
    trajectory.push({ step: s + 1, time, sharesSold: trade, remainingShares: remaining, executionPrice: execPrice, stepCost, instantaneousImpact: stepImpact, cumulativePermanentImpact: permImpact });
  }

  const vwap = q0 > 0 ? totalNotional / q0 : p0;
  return { trajectory, totalExecutionCost: totalCost, averageExecutionPrice: vwap, terminalShares: remaining, theoreticalIStar: iStar };
}

export interface KissellIStarParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly dailyVolume?: number;
  readonly dailyVolatility?: number;
  readonly impactFactor?: number; // a1, default 0.25
  readonly sizeExponent?: number; // a2, default 0.50
  readonly volatilityExponent?: number; // a3, default 1.0
  readonly stepImpactFactor?: number; // b1, default 0.35
  readonly rateExponent?: number; // b2, default 0.50
}

export interface KissellIStarStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly instantaneousImpact: number;
  readonly cumulativePermanentImpact: number;
}

export interface KissellIStarResult {
  readonly trajectory: readonly KissellIStarStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly theoreticalIStar: number;
}
