export function computeBertsimasHummelExecution(p: BertsimasHummelParams): BertsimasHummelResult {
  const n = Math.max(1, Math.floor(p.numSteps)), s0 = Math.max(0, p.totalShares);
  const t = Math.max(1e-4, p.timeHorizon), dt = t / n, eta = Math.max(1e-6, p.impactParam);
  const gamma = Math.max(1e-4, p.alphaDecay), theta = p.signalSensitivity, phi = Math.max(0, p.riskAversion);
  const trajectory: BertsimasHummelStep[] = [];
  let remaining = s0, totalCost = 0;
  for (let i = 0; i < n; i++) {
    const elapsed = i * dt, alpha = p.alphaSignal * Math.exp(-gamma * elapsed);
    const stepsLeft = n - i;
    const baseSpeed = remaining / (stepsLeft * dt);
    const alphaAdj = (theta * alpha) / (2 * eta);
    const targetSpeed = Math.max(0, baseSpeed + alphaAdj);
    const tradeSize = i === n - 1 ? remaining : Math.min(remaining, Math.max(0, targetSpeed * dt));
    const tradeSpeed = dt > 0 ? tradeSize / dt : 0;
    const impactCost = eta * (tradeSpeed ** 2) * dt, riskCost = phi * (remaining ** 2) * dt;
    const alphaGain = alpha * tradeSize;
    const stepCost = impactCost + riskCost - alphaGain;
    totalCost += stepCost;
    remaining = Math.max(0, remaining - tradeSize);
    trajectory.push({ step: i + 1, sharesRemaining: remaining, tradeSpeed, tradeSize, currentAlpha: alpha, stepCost });
  }
  const twapSize = s0 / n, twapSpeed = twapSize / dt;
  let twapCost = 0, twapRem = s0;
  for (let i = 0; i < n; i++) {
    const alpha = p.alphaSignal * Math.exp(-gamma * i * dt);
    twapCost += (eta * (twapSpeed ** 2) + phi * (twapRem ** 2) - alpha * twapSize) * dt;
    twapRem = Math.max(0, twapRem - twapSize);
  }
  return { trajectory, expectedCost: totalCost, benchmarkTwapCost: twapCost, costSavings: Math.max(0, twapCost - totalCost), terminalShares: remaining };
}

export interface BertsimasHummelParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly impactParam: number;
  readonly alphaSignal: number;
  readonly alphaDecay: number;
  readonly signalSensitivity: number;
  readonly riskAversion: number;
}

export interface BertsimasHummelStep {
  readonly step: number;
  readonly sharesRemaining: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly currentAlpha: number;
  readonly stepCost: number;
}

export interface BertsimasHummelResult {
  readonly trajectory: readonly BertsimasHummelStep[];
  readonly expectedCost: number;
  readonly benchmarkTwapCost: number;
  readonly costSavings: number;
  readonly terminalShares: number;
}
