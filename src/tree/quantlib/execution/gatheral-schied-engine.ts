import type { GatheralSchiedParams, GatheralSchiedResult, GatheralSchiedStep } from './gatheral-schied-types';

export function computeGatheralSchiedExecution(p: GatheralSchiedParams): GatheralSchiedResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const s0 = Math.max(0, p.initialInventory), p0 = p.initialPrice;
  const eta = Math.max(1e-6, p.instantaneousImpact), rho = Math.max(1e-4, p.decayRate);
  const alpha = p.powerLawAlpha ?? 1.0;
  const isNoArbitrageGuaranteed = rho > 0 && eta > 0 && alpha > 0;
  const trajectory: GatheralSchiedStep[] = [];
  const trades: number[] = [];
  let remaining = s0, totalNotional = 0;
  for (let i = 0; i < n; i++) {
    const time = (i + 1) * dt, stepsLeft = n - i;
    const tradeSize = stepsLeft === 1 ? remaining : Math.max(0, remaining / stepsLeft);
    const speed = dt > 0 ? tradeSize / dt : 0;
    let priorImpact = 0;
    for (let j = 0; j < trades.length; j++) {
      const tau = (i - j) * dt;
      const kernel = p.powerLawAlpha !== undefined ? Math.pow(1 + rho * tau, -alpha) : Math.exp(-rho * tau);
      priorImpact += eta * trades[j]! * kernel;
    }
    const selfImpact = (eta * tradeSize) / 2;
    const accImpact = priorImpact + selfImpact;
    const execPrice = p0 - accImpact;
    const stepCost = tradeSize * accImpact;
    totalNotional += tradeSize * execPrice;
    trades.push(tradeSize);
    remaining = Math.max(0, remaining - tradeSize);
    trajectory.push({ step: i + 1, time, inventoryRemaining: remaining, tradeSize, tradeSpeed: speed, accumulatedImpact: accImpact, executionPrice: execPrice, stepCost });
  }
  const terminalImpact = trajectory[trajectory.length - 1]?.accumulatedImpact ?? 0;
  const reversionPath = [1, 2, 3, 4, 5].map((step) => p0 - terminalImpact * Math.exp(-rho * step * dt));
  const totalCost = Math.max(0, s0 * p0 - totalNotional);
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  return { trajectory, totalCost, vwapPrice, terminalPrice: p0 - terminalImpact, isNoArbitrageGuaranteed, priceReversionPath: reversionPath, terminalInventory: remaining };
}
