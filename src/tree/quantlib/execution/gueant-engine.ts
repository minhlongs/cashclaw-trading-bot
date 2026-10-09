import type { GueantParams, GueantResult, GueantStep } from './gueant-types';

export function computeGueantExecution(p: GueantParams): GueantResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.totalShares);
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const eta = Math.max(1e-6, p.impactParam), alpha = Math.max(0.1, p.powerLawExponent);
  const phi = Math.max(0, p.riskAversion), psi = Math.max(0, p.terminalPenalty ?? 0);
  const power = (1 + alpha) / alpha;
  const trajectory: GueantStep[] = [];
  let remaining = s0, totalCost = 0;
  for (let i = 0; i < n; i++) {
    const elapsed = i * dt, tauRatio = Math.max(0, 1 - elapsed / t);
    const scheduledRatio = tauRatio ** power;
    const nextScheduledRatio = Math.max(0, 1 - (elapsed + dt) / t) ** power;
    const theoreticalTrade = s0 * Math.max(0, scheduledRatio - nextScheduledRatio);
    const tradeSize = i === n - 1 ? remaining : Math.min(remaining, theoreticalTrade);
    const tradeSpeed = dt > 0 ? tradeSize / dt : 0;
    const impactCost = eta * (tradeSpeed ** (1 + alpha)) * dt;
    const riskCost = phi * (remaining ** 2) * dt;
    const stepCost = impactCost + riskCost;
    totalCost += stepCost;
    remaining = Math.max(0, remaining - tradeSize);
    trajectory.push({ step: i + 1, sharesRemaining: remaining, tradeSpeed, tradeSize, stepCost });
  }
  totalCost += psi * (remaining ** 2);
  const twapSize = s0 / n, twapSpeed = twapSize / dt;
  let twapCost = 0, twapRem = s0;
  for (let i = 0; i < n; i++) {
    twapCost += (eta * (twapSpeed ** (1 + alpha)) + phi * (twapRem ** 2)) * dt;
    twapRem = Math.max(0, twapRem - twapSize);
  }
  return {
    trajectory, expectedCost: totalCost, benchmarkTwapCost: twapCost,
    costSavings: Math.max(0, twapCost - totalCost), terminalShares: remaining,
  };
}
