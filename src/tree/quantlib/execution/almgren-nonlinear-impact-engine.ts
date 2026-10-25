export function computeOptimalExecution(p: AlmgrenExecutionParams): AlmgrenExecutionResult {
  const n = Math.max(1, Math.floor(p.numSteps));
  const t = Math.max(1e-4, p.timeHorizon);
  const tau = t / n;
  const eta = Math.max(1e-6, p.temporaryImpactEta);
  const gamma = Math.max(0, p.permanentImpactGamma ?? 0);
  const lambda = Math.max(1e-6, p.riskAversion);
  const sigma = Math.max(1e-6, p.volatility);
  const alpha = Math.max(0.1, p.powerExponent ?? 0.5);

  const kappa = Math.sqrt((lambda * sigma * sigma) / eta);
  const sinhKT = Math.sinh(kappa * t);

  const schedule: AlmgrenExecutionStep[] = [];
  let remaining = p.totalShares;
  let expectedCost = 0.5 * gamma * p.totalShares * p.totalShares;
  let variance = 0;

  for (let k = 0; k < n; k++) {
    const timeRemaining = t - (k + 1) * tau;
    const trajFactor = k === n - 1
      ? 0
      : (sinhKT > 1e-8 ? Math.sinh(kappa * timeRemaining) / sinhKT : (n - (k + 1)) / n);
    const targetRemaining = p.totalShares * trajFactor;
    const tradeSize = remaining - targetRemaining;
    const speed = tradeSize / tau;

    const stepCost = eta * Math.pow(Math.abs(speed), alpha) * Math.abs(tradeSize);
    expectedCost += stepCost;
    variance += sigma * sigma * remaining * remaining * tau;

    schedule.push({ step: k, remainingShares: remaining, tradeSize, tradingSpeed: speed });
    remaining = targetRemaining;
  }

  const halfLife = kappa > 1e-8 ? Math.log(2) / kappa : t / 2;
  const utility = expectedCost + lambda * variance;

  return { schedule, expectedCost, variance, utility, halfLife };
}

export interface AlmgrenExecutionParams {
  readonly totalShares: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly volatility: number;
  readonly riskAversion: number;
  readonly temporaryImpactEta: number;
  readonly powerExponent?: number;
  readonly permanentImpactGamma?: number;
}

export interface AlmgrenExecutionStep {
  readonly step: number;
  readonly remainingShares: number;
  readonly tradeSize: number;
  readonly tradingSpeed: number;
}

export interface AlmgrenExecutionResult {
  readonly schedule: readonly AlmgrenExecutionStep[];
  readonly expectedCost: number;
  readonly variance: number;
  readonly utility: number;
  readonly halfLife: number;
}
