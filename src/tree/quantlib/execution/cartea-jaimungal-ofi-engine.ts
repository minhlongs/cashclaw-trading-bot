import type { CarteaJaimungalOfiParams, CarteaJaimungalOfiResult, CarteaJaimungalOfiStep } from './cartea-jaimungal-ofi-types';

export function computeCarteaJaimungalOfiExecution(p: CarteaJaimungalOfiParams): CarteaJaimungalOfiResult {
  const n = Math.max(1, Math.floor(p.numSteps));
  const s0 = Math.max(0, p.totalShares);
  const t = Math.max(1e-4, p.timeHorizon);
  const dt = t / n;
  const k = Math.max(1e-6, p.temporaryImpact);
  const b = Math.max(0, p.permanentImpact);
  const phi = Math.max(0, p.riskAversion);
  const drift = p.ofiDrift;

  const zeta = Math.sqrt(Math.max(1e-8, phi / k));
  const trajectory: CarteaJaimungalOfiStep[] = [];
  let remaining = s0, totalCost = 0;

  for (let i = 0; i < n; i++) {
    const tau = Math.max(0, t - i * dt);
    const sinhZetaTau = Math.sinh(zeta * tau);
    const coshZetaTau = Math.cosh(zeta * tau);
    const denom = Math.sinh(zeta * t) || 1e-6;
    const baseNu = remaining <= 0 ? 0 : (zeta * coshZetaTau / denom) * s0;
    const ofiNu = (drift / (2 * k)) * (1 - (sinhZetaTau / denom));
    const rawNu = i === n - 1 ? remaining / dt : Math.max(0, baseNu + ofiNu);
    const tradeSize = Math.min(remaining, rawNu * dt);
    remaining = Math.max(0, remaining - tradeSize);
    const stepCost = (k * (rawNu ** 2) + b * tradeSize * (s0 - remaining) - drift * remaining) * dt;
    totalCost += stepCost;
    trajectory.push({ step: i + 1, tradeSpeed: rawNu, tradeSize, remainingShares: remaining, stepCost });
  }

  const twapSize = s0 / n;
  let twapCost = 0, twapRem = s0;
  for (let i = 0; i < n; i++) {
    twapCost += (k * ((twapSize / dt) ** 2) + b * twapSize * (s0 - twapRem) - drift * twapRem) * dt;
    twapRem = Math.max(0, twapRem - twapSize);
  }

  const ofiAdjustment = drift * s0 * t * 0.5;
  return {
    trajectory, expectedCost: totalCost, benchmarkTwapCost: twapCost, ofiCostAdjustment: ofiAdjustment,
    costSavings: Math.max(0, twapCost - totalCost),
  };
}
