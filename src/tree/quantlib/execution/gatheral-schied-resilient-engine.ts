import type { GatheralSchiedResilientParams, GatheralSchiedResilientResult, GatheralSchiedResilientStep } from './gatheral-schied-resilient-types';

export function computeGatheralSchiedResilientExecution(p: GatheralSchiedResilientParams): GatheralSchiedResilientResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const q0 = Math.max(0, p.initialShares), p0 = p.initialPrice, eta = Math.max(1e-6, p.temporaryImpact);
  const rho = Math.max(0, p.decayRate), alpha = Math.min(1, Math.max(0.01, p.decayExponent)), k = p.impactPower ?? 1;
  const trajectory: GatheralSchiedResilientStep[] = [];
  const tradeRates: number[] = [];
  let remaining = q0, totalCost = 0, totalNotional = 0;

  for (let s = 0; s < n; s++) {
    const trade = s === n - 1 ? remaining : remaining / (n - s);
    const rate = trade / dt;
    tradeRates.push(rate);
    let transientImpact = 0;
    for (let j = 0; j <= s; j++) {
      const tau = (s - j) * dt;
      const kernel = Math.pow(1 + rho * tau, -alpha);
      transientImpact += eta * Math.pow(tradeRates[j]!, k) * kernel * (j === s ? 1 : dt);
    }
    const execPrice = Math.max(1e-4, p0 - transientImpact);
    const stepCost = trade * (p0 - execPrice);
    remaining = Math.max(0, remaining - trade);
    totalNotional += trade * execPrice;
    totalCost += stepCost;
    trajectory.push({ step: s + 1, time: (s + 1) * dt, sharesSold: trade, remainingShares: remaining, executionPrice: execPrice, stepCost });
  }

  const vwap = q0 > 0 ? totalNotional / q0 : p0;
  const lastTau = t;
  const reversion = p0 - (trajectory[trajectory.length - 1]?.executionPrice ?? p0) * Math.pow(1 + rho * lastTau, -alpha);
  return { trajectory, totalExecutionCost: totalCost, averageExecutionPrice: vwap, terminalShares: remaining, priceReversion: reversion };
}
