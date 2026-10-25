export function computeLehalleNeumanExecution(p: LehalleNeumanParams): LehalleNeumanResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.totalShares);
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const k = Math.max(1e-6, p.temporaryImpact), b = Math.max(0, p.permanentImpact);
  const phi = Math.max(0, p.riskAversion), alpha0 = p.signalAlpha;
  const gamma = Math.max(1e-4, p.signalDecay);
  const zeta = Math.sqrt(Math.max(1e-8, phi / k));
  const trajectory: LehalleNeumanStep[] = [];
  let remaining = s0, totalCost = 0;
  for (let i = 0; i < n; i++) {
    const elapsed = i * dt, tau = Math.max(0, t - elapsed);
    const coshZetaTau = Math.cosh(zeta * tau), denom = Math.sinh(zeta * t) || 1e-6;
    const baseNu = remaining <= 0 ? 0 : (zeta * coshZetaTau / denom) * s0;
    const sigVal = alpha0 * Math.exp(-gamma * elapsed);
    const forwardIntegral = (sigVal / (gamma + zeta)) * (1 - Math.exp(-(gamma + zeta) * tau));
    const sigNu = remaining <= 0 ? 0 : (1 / (2 * k)) * forwardIntegral;
    const rawNu = remaining <= 0 ? 0 : (i === n - 1 ? remaining / dt : Math.max(0, baseNu + sigNu));
    const tradeSize = Math.min(remaining, rawNu * dt);
    remaining = Math.max(0, remaining - tradeSize);
    const stepCost = (k * (rawNu ** 2) + b * tradeSize * (s0 - remaining) - sigVal * remaining) * dt;
    totalCost += stepCost;
    trajectory.push({ step: i + 1, tradeSpeed: rawNu, tradeSize, remainingShares: remaining, signalValue: sigVal, stepCost });
  }
  const twapSize = s0 / n;
  let twapCost = 0, twapRem = s0;
  for (let i = 0; i < n; i++) {
    const sigVal = alpha0 * Math.exp(-gamma * i * dt);
    twapCost += (k * ((twapSize / dt) ** 2) + b * twapSize * (s0 - twapRem) - sigVal * twapRem) * dt;
    twapRem = Math.max(0, twapRem - twapSize);
  }
  const signalContrib = (alpha0 / gamma) * s0 * (1 - Math.exp(-gamma * t)) * (1 / t);
  return {
    trajectory, expectedCost: totalCost, benchmarkTwapCost: twapCost,
    signalAlphaContribution: signalContrib, costSavings: Math.max(0, twapCost - totalCost),
  };
}

export interface LehalleNeumanParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly temporaryImpact: number;
  readonly permanentImpact: number;
  readonly riskAversion: number;
  readonly signalAlpha: number;
  readonly signalDecay: number;
}

export interface LehalleNeumanStep {
  readonly step: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly signalValue: number;
  readonly stepCost: number;
}

export interface LehalleNeumanResult {
  readonly trajectory: readonly LehalleNeumanStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly signalAlphaContribution: number;
  readonly costSavings: number;
}
