import type { AlmgrenThumParams, AlmgrenThumResult, AlmgrenThumStep } from './almgren-thum-types';

export function computeAlmgrenThumExecution(p: AlmgrenThumParams): AlmgrenThumResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const q0 = Math.max(0, p.initialShares), p0 = p.initialPrice, vol = Math.max(1, p.dailyVolume ?? 1_000_000);
  const eta = Math.max(1e-6, p.temporaryImpactFactor), gamma = Math.max(0, p.permanentImpactFactor ?? 0.05);
  const alpha = Math.max(0.1, Math.min(2.0, p.powerExponent ?? 0.6));
  const trajectory: AlmgrenThumStep[] = [];
  let remaining = q0, totalCost = 0, totalNotional = 0, cumSold = 0;

  for (let s = 0; s < n; s++) {
    const time = (s + 1) * dt, trade = s === n - 1 ? remaining : remaining / (n - s);
    cumSold += trade;
    const normRate = trade / (dt * vol);
    const tempImpact = eta * Math.pow(Math.max(0, normRate), alpha);
    const permImpact = gamma * (cumSold / vol);
    const execPrice = Math.max(1e-4, p0 - permImpact - tempImpact);
    const stepCost = trade * (p0 - execPrice);
    remaining = Math.max(0, remaining - trade);
    totalNotional += trade * execPrice;
    totalCost += stepCost;
    trajectory.push({ step: s + 1, time, sharesSold: trade, remainingShares: remaining, executionPrice: execPrice, stepCost, temporaryImpact: tempImpact, permanentImpact: permImpact });
  }

  const vwap = q0 > 0 ? totalNotional / q0 : p0;
  const totalPerm = gamma * (q0 / vol);
  return { trajectory, totalExecutionCost: totalCost, averageExecutionPrice: vwap, terminalShares: remaining, permanentPriceImpact: totalPerm };
}
