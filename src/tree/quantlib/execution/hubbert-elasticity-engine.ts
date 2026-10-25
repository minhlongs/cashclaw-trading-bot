export function computeHubbertElasticityExecution(p: HubbertElasticityParams): HubbertElasticityResult {
  const n = Math.max(1, Math.floor(p.numSteps));
  const s = Math.max(0, p.totalShares);
  const alpha = Math.max(0, Math.min(0.95, p.elasticityAlpha));
  const rho = Math.max(0, p.baseResilience);
  const dt = Math.max(1e-4, p.timeStep ?? 1.0);
  const q0 = Math.max(1e-6, p.depthParameter ?? 10_000);
  const lambda0 = 1 / q0;

  const kappa = Math.exp(-rho * dt);
  const elasticityFactor = 1 / Math.pow(1 - alpha, 0.5);
  const effectiveLambda = lambda0 * elasticityFactor;

  const denom = n <= 1 ? 1 : Math.max(1e-6, 2 + (n - 2) * (1 - kappa));
  const block0 = n <= 1 ? s : s / denom;
  const intermediate = n <= 2 ? 0 : block0 * (1 - kappa);

  const trajectory: HubbertElasticityStep[] = [];
  let remaining = s, totalCost = 0, currentImpact = 0;

  for (let k = 0; k < n; k++) {
    const size = k === 0 || k === n - 1 ? (n === 1 ? s : block0) : intermediate;
    const prior = currentImpact * kappa;
    const stepCost = (prior + 0.5 * effectiveLambda * size) * size;
    currentImpact = prior + effectiveLambda * size;
    remaining = Math.max(0, remaining - size);
    totalCost += stepCost;
    trajectory.push({ step: k + 1, tradeSize: size, remainingShares: remaining, effectiveElasticity: elasticityFactor, stepCost });
  }

  const twapSize = s / n;
  let twapImpact = 0, twapCost = 0;
  for (let k = 0; k < n; k++) {
    const prior = twapImpact * kappa;
    twapCost += (prior + 0.5 * effectiveLambda * twapSize) * twapSize;
    twapImpact = prior + effectiveLambda * twapSize;
  }

  const immediateCost = 0.5 * effectiveLambda * s * s;
  return {
    trajectory, expectedCost: totalCost, twapCost, immediateCost,
    liquiditySavings: Math.max(0, immediateCost - totalCost),
    elasticityScalingFactor: elasticityFactor,
  };
}

export interface HubbertElasticityParams {
  readonly totalShares: number;
  readonly numSteps: number;
  readonly elasticityAlpha: number; // Price elasticity of market depth: alpha in [0, 1)
  readonly baseResilience: number;  // Order book depth refill speed
  readonly timeStep?: number;
  readonly depthParameter?: number; // Base depth Q_0
}

export interface HubbertElasticityStep {
  readonly step: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly effectiveElasticity: number;
  readonly stepCost: number;
}

export interface HubbertElasticityResult {
  readonly trajectory: readonly HubbertElasticityStep[];
  readonly expectedCost: number;
  readonly twapCost: number;
  readonly immediateCost: number;
  readonly liquiditySavings: number;
  readonly elasticityScalingFactor: number;
}
