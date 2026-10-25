export function computeLorenzAlmgrenExecution(p: LorenzAlmgrenParams): LorenzAlmgrenResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.initialShares), p0 = p.initialPrice;
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n, sigma = Math.max(1e-5, p.volatility);
  const lambda = Math.max(1e-8, p.riskAversion), eta = Math.max(1e-6, p.temporaryImpact);
  const beta = p.priceDriftSensitivity ?? 0.5, kappa = Math.sqrt((lambda * sigma * sigma) / eta);
  const trajectory: LorenzAlmgrenStep[] = [];
  let remaining = s0, totalNotional = 0, currentPrice = p0, totalVariance = 0;

  for (let i = 0; i < n; i++) {
    const tau = (i + 1) * dt, timeLeft = Math.max(1e-4, t - i * dt);
    const staticRate = 1 / Math.max(1, n - i);
    const priceDrift = (currentPrice - p0) / (sigma * p0);
    const adaptiveFactor = Math.max(0.2, Math.min(3.0, 1 + beta * priceDrift * Math.tanh(kappa * timeLeft)));
    const targetSize = (i === n - 1) ? remaining : Math.min(remaining, remaining * staticRate * adaptiveFactor);
    const impactPriceMove = eta * (targetSize / dt);
    const execPrice = Math.max(1e-4, currentPrice - impactPriceMove);
    const stepCost = targetSize * (currentPrice - execPrice);
    totalNotional += targetSize * execPrice;
    totalVariance += Math.pow(targetSize * sigma * Math.sqrt(dt), 2);
    remaining = Math.max(0, remaining - targetSize);
    currentPrice = execPrice;
    trajectory.push({ step: i + 1, time: tau, sharesExecuted: targetSize, sharesRemaining: remaining, adaptiveSpeedFactor: adaptiveFactor, executionPrice: execPrice, stepCost });
  }

  const totalCost = Math.max(0, s0 * p0 - totalNotional);
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  const utility = -(totalCost + 0.5 * lambda * totalVariance);
  return { trajectory, totalExecutionCost: totalCost, vwapPrice, meanVarianceUtility: utility, terminalShares: remaining };
}

export interface LorenzAlmgrenParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly numSteps: number;
  readonly timeHorizon: number;
  readonly volatility: number;
  readonly riskAversion: number;
  readonly temporaryImpact: number;
  readonly priceDriftSensitivity?: number;
}

export interface LorenzAlmgrenStep {
  readonly step: number;
  readonly time: number;
  readonly sharesExecuted: number;
  readonly sharesRemaining: number;
  readonly adaptiveSpeedFactor: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface LorenzAlmgrenResult {
  readonly trajectory: readonly LorenzAlmgrenStep[];
  readonly totalExecutionCost: number;
  readonly vwapPrice: number;
  readonly meanVarianceUtility: number;
  readonly terminalShares: number;
}
