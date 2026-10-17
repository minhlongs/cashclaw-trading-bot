export type AlmgrenChrissStrategyClass =
  | 'URGENT_FRONT_LOADED'
  | 'BALANCED_AC_TRAJECTORY'
  | 'PASSIVE_TWAP_LIMIT';

export interface AlmgrenChrissParams {
  readonly totalShares: number;
  readonly horizonSteps: number;
  readonly stepSeconds: number;
  readonly volatility: number;
  readonly riskAversionLambda: number;
  readonly tempImpactEta: number;
  readonly permImpactGamma: number;
}

export interface AlmgrenChrissSlice {
  readonly step: number;
  readonly timeSec: number;
  readonly remainingInventory: number;
  readonly sliceShares: number;
}

export interface AlmgrenChrissTrajectoryResult {
  readonly urgencyKappa: number;
  readonly expectedShortfallCost: number;
  readonly varianceShortfall: number;
  readonly firstSliceRatio: number;
  readonly strategyClass: AlmgrenChrissStrategyClass;
  readonly trajectory: readonly AlmgrenChrissSlice[];
}

function classifyStrategy(firstSliceRatio: number, steps: number): AlmgrenChrissStrategyClass {
  const twapShare = 1 / steps;
  if (firstSliceRatio >= twapShare * 1.35) return 'URGENT_FRONT_LOADED';
  if (firstSliceRatio <= twapShare * 1.03) return 'PASSIVE_TWAP_LIMIT';
  return 'BALANCED_AC_TRAJECTORY';
}

export function computeAlmgrenChrissTrajectory(
  params: AlmgrenChrissParams,
): AlmgrenChrissTrajectoryResult {
  const X = Math.max(0.01, params.totalShares);
  const N = Math.max(2, Math.floor(params.horizonSteps));
  const tau = Math.max(1, params.stepSeconds);
  const T = N * tau;
  const sigma = Math.max(1e-6, params.volatility);
  const lambda = Math.max(0, params.riskAversionLambda);
  const eta = Math.max(1e-6, params.tempImpactEta);
  const gamma = Math.max(0, params.permImpactGamma);

  const kappa = Math.sqrt((lambda * sigma * sigma) / eta);
  const kappaT = kappa * T;
  const useTwapFallback = kappaT < 1e-4;

  const trajectory: AlmgrenChrissSlice[] = [];
  let prevInventory = X;
  let tempCostSum = 0;
  let varSum = 0;

  for (let k = 1; k <= N; k++) {
    const tk = k * tau;
    const rem = useTwapFallback
      ? X * ((T - tk) / T)
      : X * (Math.sinh(kappa * (T - tk)) / Math.sinh(kappaT));
    const remainingInventory = Math.max(0, Number(rem.toFixed(4)));
    const sliceShares = Number((prevInventory - remainingInventory).toFixed(4));
    trajectory.push({ step: k, timeSec: tk, remainingInventory, sliceShares });

    tempCostSum += eta * ((sliceShares * sliceShares) / tau);
    varSum += sigma * sigma * tau * remainingInventory * remainingInventory;
    prevInventory = remainingInventory;
  }

  const permCost = 0.5 * gamma * X * X;
  const expectedShortfallCost = Number((permCost + tempCostSum).toFixed(4));
  const varianceShortfall = Number(varSum.toFixed(4));
  const firstSliceRatio = Number(((trajectory[0]?.sliceShares ?? 0) / X).toFixed(4));

  return {
    urgencyKappa: Number(kappa.toFixed(6)),
    expectedShortfallCost,
    varianceShortfall,
    firstSliceRatio,
    strategyClass: classifyStrategy(firstSliceRatio, N),
    trajectory,
  };
}
