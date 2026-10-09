import type { CarteaJaimungalParams, CarteaJaimungalResult, CarteaJaimungalStep } from './cartea-jaimungal-types';

export function computeCarteaJaimungalExecution(p: CarteaJaimungalParams): CarteaJaimungalResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.initialShares), p0 = p.initialPrice;
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n, phi = Math.max(1e-8, p.inventoryPenalty);
  const eta = Math.max(1e-6, p.temporaryImpact), alpha = p.alphaDrift ?? 0;
  const zeta = Math.sqrt(phi / eta), trajectory: CarteaJaimungalStep[] = [];
  let remaining = s0, totalNotional = 0, currentPrice = p0;

  for (let i = 0; i < n; i++) {
    const tau = (i + 1) * dt, timeLeft = Math.max(1e-4, t - i * dt);
    const cothTerm = 1 / Math.tanh(Math.max(1e-4, zeta * timeLeft));
    // Speed nu_t^* = q_t * zeta * coth(zeta*(T-t)) + alpha / (2 * eta)
    const baseSpeed = remaining * zeta * cothTerm;
    const alphaAdjustment = alpha / (2 * eta);
    const speed = Math.max(0, baseSpeed - alphaAdjustment); // liquidation slows if alpha > 0
    const targetSize = (i === n - 1) ? remaining : Math.min(remaining, Math.max(0, speed * dt));
    const impactPriceMove = eta * (targetSize / dt);
    const execPrice = Math.max(1e-4, currentPrice - impactPriceMove);
    const stepCost = targetSize * (currentPrice - execPrice);
    totalNotional += targetSize * execPrice;
    remaining = Math.max(0, remaining - targetSize);
    currentPrice = execPrice;
    trajectory.push({ step: i + 1, time: tau, sharesExecuted: targetSize, sharesRemaining: remaining, executionPrice: execPrice, stepCost });
  }

  const totalCost = Math.max(0, s0 * p0 - totalNotional);
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  return { trajectory, totalExecutionCost: totalCost, vwapPrice, terminalShares: remaining, effectiveAlphaTilt: alpha / (2 * eta) };
}
