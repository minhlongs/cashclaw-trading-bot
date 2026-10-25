export function computeAlmgrenDriftExecution(p: AlmgrenDriftParams): AlmgrenDriftResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const q0 = Math.max(0, p.initialShares), p0 = p.initialPrice, eta = Math.max(1e-6, p.temporaryImpact);
  const kappa = Math.max(0, p.meanReversionSpeed), lambda = Math.max(0, p.riskAversion ?? 1e-4);
  const sigma = Math.max(0, p.volatility ?? 0.02), alpha0 = p.initialDrift;
  const zeta = Math.sqrt(Math.max(1e-6, (lambda * sigma * sigma) / eta));
  const trajectory: AlmgrenDriftStep[] = [];
  let remaining = q0, totalCost = 0, totalNotional = 0, currentPrice = p0;

  for (let s = 0; s < n; s++) {
    const time = (s + 1) * dt, drift = alpha0 * Math.exp(-kappa * (s * dt));
    currentPrice += drift * dt;
    const baseTrade = s === n - 1 ? remaining : remaining / (n - s);
    const driftAdjustment = (drift / (2 * eta * (zeta + 1e-4))) * dt * q0;
    const rawTrade = baseTrade - driftAdjustment;
    const trade = s === n - 1 ? remaining : Math.max(0, Math.min(remaining, rawTrade));
    const impact = eta * (trade / dt);
    const execPrice = Math.max(1e-4, currentPrice - impact);
    const stepCost = trade * (p0 - execPrice);
    remaining = Math.max(0, remaining - trade);
    totalNotional += trade * execPrice;
    totalCost += stepCost;
    trajectory.push({ step: s + 1, time, sharesSold: trade, remainingShares: remaining, executionPrice: execPrice, stepCost, driftEstimate: drift });
  }

  const vwap = q0 > 0 ? totalNotional / q0 : p0;
  const driftAlphaCapture = totalNotional - q0 * (p0 - eta * (q0 / t));
  return { trajectory, totalExecutionCost: totalCost, averageExecutionPrice: vwap, terminalShares: remaining, driftAlphaCapture };
}

export interface AlmgrenDriftParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly temporaryImpact: number;
  readonly riskAversion?: number;
  readonly volatility?: number;
  readonly initialDrift: number;
  readonly meanReversionSpeed: number; // kappa >= 0
}

export interface AlmgrenDriftStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly driftEstimate: number;
}

export interface AlmgrenDriftResult {
  readonly trajectory: readonly AlmgrenDriftStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly driftAlphaCapture: number;
}
