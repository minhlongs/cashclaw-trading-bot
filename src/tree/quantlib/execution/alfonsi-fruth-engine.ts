export function computeAlfonsiFruthExecution(p: AlfonsiFruthParams): AlfonsiFruthResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const s0 = Math.max(0, p.initialInventory), p0 = p.initialPrice;
  const kappa = Math.max(1e-4, p.resilienceSpeed), eta = Math.max(1e-6, p.impactFactor);
  const alpha = p.shapeExponent ?? 1.0;
  const decayFactor = Math.exp(-kappa * dt);
  const trajectory: AlfonsiFruthStep[] = [];
  let remaining = s0, currentImpact = 0, totalNotional = 0, initialGrossImpact = 0;

  for (let i = 0; i < n; i++) {
    const time = (i + 1) * dt, stepsLeft = n - i;
    const tradeSize = stepsLeft === 1 ? remaining : Math.max(0, remaining / stepsLeft);
    const instImpact = eta * Math.pow(tradeSize, alpha);
    initialGrossImpact += instImpact;
    currentImpact = currentImpact * decayFactor + instImpact;
    const execPrice = p0 - currentImpact;
    const stepCost = tradeSize * currentImpact;
    totalNotional += tradeSize * execPrice;
    remaining = Math.max(0, remaining - tradeSize);
    trajectory.push({ step: i + 1, time, inventoryRemaining: remaining, tradeSize, instantaneousImpact: instImpact, relaxedImpact: currentImpact, executionPrice: execPrice, stepCost });
  }

  const totalCost = Math.max(0, s0 * p0 - totalNotional);
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  const terminalPrice = p0 - currentImpact;
  const resilienceRecoveryBps = initialGrossImpact > 0 ? Math.max(0, (1 - currentImpact / initialGrossImpact) * 10000) : 0;
  return { trajectory, totalCost, vwapPrice, terminalPrice, resilienceRecoveryBps, terminalInventory: remaining };
}

export interface AlfonsiFruthParams {
  readonly initialInventory: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly resilienceSpeed: number;
  readonly impactFactor: number;
  readonly shapeExponent?: number;
}

export interface AlfonsiFruthStep {
  readonly step: number;
  readonly time: number;
  readonly inventoryRemaining: number;
  readonly tradeSize: number;
  readonly instantaneousImpact: number;
  readonly relaxedImpact: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface AlfonsiFruthResult {
  readonly trajectory: readonly AlfonsiFruthStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly terminalPrice: number;
  readonly resilienceRecoveryBps: number;
  readonly terminalInventory: number;
}
