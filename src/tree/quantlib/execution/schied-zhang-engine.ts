import type { SchiedZhangParams, SchiedZhangResult, SchiedZhangStep } from './schied-zhang-types';

export function computeSchiedZhangExecution(p: SchiedZhangParams): SchiedZhangResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.initialShares), p0 = p.initialPrice;
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n, h = Math.min(0.5, Math.max(0.01, p.hurstParameter));
  const sigma0 = Math.max(1e-5, p.baseVolatility), lambda = Math.max(1e-6, p.riskAversion);
  const eta = Math.max(1e-6, p.temporaryImpact), roughness = Math.pow(dt, h - 0.5);
  const trajectory: SchiedZhangStep[] = [];
  let remaining = s0, totalNotional = 0, currentPrice = p0;

  for (let i = 0; i < n; i++) {
    const tau = (i + 1) * dt, timeLeft = Math.max(1e-4, t - i * dt);
    const localSigma = sigma0 * Math.pow(tau / t, Math.max(0, 0.5 - h));
    const urgency = Math.sqrt((lambda * localSigma * localSigma) / (eta * roughness));
    const cothTerm = 1 / Math.tanh(Math.max(1e-4, urgency * timeLeft));
    const speed = remaining * urgency * cothTerm;
    const targetSize = (i === n - 1) ? remaining : Math.min(remaining, Math.max(0, speed * dt));
    const impactPriceMove = eta * (targetSize / dt) * roughness;
    const execPrice = Math.max(1e-4, currentPrice - impactPriceMove);
    const stepCost = targetSize * (currentPrice - execPrice);
    totalNotional += targetSize * execPrice;
    remaining = Math.max(0, remaining - targetSize);
    currentPrice = execPrice;
    trajectory.push({ step: i + 1, time: tau, sharesExecuted: targetSize, sharesRemaining: remaining, localVolatility: localSigma, executionPrice: execPrice, stepCost });
  }

  const totalCost = Math.max(0, s0 * p0 - totalNotional);
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  return { trajectory, totalExecutionCost: totalCost, vwapPrice, terminalShares: remaining, roughnessMultiplier: roughness };
}
