import type {
  BanditArmState,
  StrategyPerformanceReward,
  StrategyWeightAllocation,
  VolatilityRegime,
} from './bandit-types';

export function updateBanditArms(
  currentArms: readonly BanditArmState[],
  rewards: readonly StrategyPerformanceReward[],
): BanditArmState[] {
  const armMap = new Map(currentArms.map((a) => [a.strategyId, { ...a }]));

  for (const r of rewards) {
    const existing = armMap.get(r.strategyId) ?? {
      strategyId: r.strategyId,
      alpha: 1.0,
      beta: 1.0,
    };

    const deltaAlpha = Math.max(0, r.sortinoRatio * 1.5 + (r.winRatePct / 100) * 2.0);
    const deltaBeta = Math.max(0, r.maxDrawdownPct * 5.0 + (r.sortinoRatio < 0 ? Math.abs(r.sortinoRatio) : 0));

    armMap.set(r.strategyId, {
      strategyId: r.strategyId,
      alpha: Math.round((existing.alpha + deltaAlpha) * 1e3) / 1e3,
      beta: Math.round((existing.beta + deltaBeta) * 1e3) / 1e3,
    });
  }

  return Array.from(armMap.values());
}

export function sampleBetaAllocation(
  arms: readonly BanditArmState[],
  regime: VolatilityRegime = 'TRENDING_MOMENTUM',
  pseudoRandoms?: readonly number[],
  explorationFloorPct = 5.0,
): StrategyWeightAllocation[] {
  if (arms.length === 0) return [];

  // Deterministic approximation of Beta(a, b) sample using inverse CDF or mean + jitter
  const thetas = arms.map((arm, idx) => {
    const u = pseudoRandoms && pseudoRandoms[idx] !== undefined ? pseudoRandoms[idx] : 0.5;
    const mean = arm.alpha / (arm.alpha + arm.beta);
    const variance = (arm.alpha * arm.beta) / (Math.pow(arm.alpha + arm.beta, 2) * (arm.alpha + arm.beta + 1));
    const std = Math.sqrt(variance);
    // Perturbation bounded around mean
    const sample = Math.max(0.01, mean + (u - 0.5) * 2 * std);

    // Regime preference modifier
    let regimeMultiplier = 1.0;
    if (regime === 'LOW_VOL_CHOP' && arm.strategyId.includes('grid')) regimeMultiplier = 1.35;
    if (regime === 'HIGH_VOL_CRISIS' && arm.strategyId.includes('reversion')) regimeMultiplier = 1.35;
    if (regime === 'TRENDING_MOMENTUM' && arm.strategyId.includes('dca')) regimeMultiplier = 1.35;

    return sample * regimeMultiplier;
  });

  const sumTheta = thetas.reduce((sum, val) => sum + val, 0);
  const n = arms.length;
  const rawWeights = thetas.map((t) => (t / sumTheta) * 100);

  // Apply exploration floor
  const remainingBudget = 100 - n * explorationFloorPct;
  const adjustedWeights = rawWeights.map((w) =>
    Math.round((explorationFloorPct + (w / 100) * remainingBudget) * 1e2) / 1e2,
  );

  return arms.map((arm, i) => ({
    strategyId: arm.strategyId,
    targetWeightPct: adjustedWeights[i],
    sampledTheta: Math.round(thetas[i] * 1e4) / 1e4,
    regimeBiasApplied: regime !== 'TRENDING_MOMENTUM',
  }));
}
