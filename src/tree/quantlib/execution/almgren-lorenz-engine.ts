export function computeAlmgrenLorenzExecution(p: AlmgrenLorenzParams): AlmgrenLorenzResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.totalShares);
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n, p0 = Math.max(0, p.initialPrice);
  const eta = Math.max(1e-6, p.temporaryImpactCoeff), beta = p.adaptiveSensitivity;
  const sigma = Math.max(1e-4, p.volatility);
  const trajectory: AlmgrenLorenzStep[] = [];
  let remaining = s0, totalCost = 0, totalNotional = 0;
  for (let i = 0; i < n; i++) {
    const stepsLeft = n - i;
    const currentPrice = p.priceTrajectory?.[i] ?? p0;
    const priceReturn = p0 > 0 ? (currentPrice - p0) / (p0 * sigma) : 0;
    const factor = Math.min(3.0, Math.max(0.2, 1 + beta * priceReturn));
    const baseTrade = remaining / stepsLeft;
    const tradeSize = i === n - 1 ? remaining : Math.min(remaining, Math.max(0, baseTrade * factor));
    const tradeSpeed = dt > 0 ? tradeSize / dt : 0;
    const tempImpact = eta * tradeSpeed;
    const execPrice = currentPrice - tempImpact;
    const stepCost = tradeSize * tempImpact;
    totalCost += stepCost;
    totalNotional += tradeSize * execPrice;
    remaining = Math.max(0, remaining - tradeSize);
    trajectory.push({ step: i + 1, sharesRemaining: remaining, tradeSize, tradeSpeed, currentPrice, adaptiveSpeedFactor: factor, executionPrice: execPrice, stepCost });
  }
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  const staticCost = (eta * (s0 / t)) * s0;
  const adaptationBenefit = staticCost - totalCost;
  return { trajectory, totalCost, vwapPrice, adaptationBenefit, terminalShares: remaining };
}

export interface AlmgrenLorenzParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly volatility: number;
  readonly urgencyCoeff: number;
  readonly adaptiveSensitivity: number;
  readonly initialPrice: number;
  readonly temporaryImpactCoeff: number;
  readonly priceTrajectory?: readonly number[];
}

export interface AlmgrenLorenzStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSize: number;
  readonly tradeSpeed: number;
  readonly currentPrice: number;
  readonly adaptiveSpeedFactor: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface AlmgrenLorenzResult {
  readonly trajectory: readonly AlmgrenLorenzStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly adaptationBenefit: number;
  readonly terminalShares: number;
}
