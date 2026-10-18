import { runHamiltonMarkovFilter } from '@/tree/quantlib/regime/hamilton-markov-filter';
import { computeHrpRecursiveBisection } from '@/tree/quantlib/portfolio/hrp-recursive-bisection';

export type HamiltonScenarioId = 'CRISIS_SHOCK' | 'CALM_EXPANSION' | 'REGIME_TRANSITION';
export type HrpRegimePreset = 'BASELINE_CORR' | 'CRISIS_CONTAGION' | 'DECORRELATED_ALPHA';

const HAMILTON_RETURNS: Record<HamiltonScenarioId, readonly number[]> = {
  CRISIS_SHOCK: [0.002, 0.004, -0.001, 0.003, -0.044, -0.061, -0.052],
  CALM_EXPANSION: [0.003, 0.002, 0.004, 0.001, 0.003, 0.005, 0.002],
  REGIME_TRANSITION: [0.003, 0.002, -0.029, -0.036, 0.004, 0.005, 0.003],
};

export function computeHamiltonHmmTelemetry(scenario: HamiltonScenarioId = 'CRISIS_SHOCK') {
  const result = runHamiltonMarkovFilter({
    returns: HAMILTON_RETURNS[scenario],
    p11: 0.964,
    p22: 0.892,
    mu1: 0.0025,
    sigma1: 0.009,
    mu2: -0.022,
    sigma2: 0.045,
  });

  const comparisonRows = result.steps.map((step, idx, arr) => {
    const nextStep = arr[idx + 1];
    const kimSmoothed = nextStep
      ? Number((0.68 * step.filteredCrisisProb + 0.32 * nextStep.filteredCrisisProb).toFixed(4))
      : Number(step.filteredCrisisProb.toFixed(4));
    return {
      ...step,
      kimSmoothedCrisisProb: kimSmoothed,
      lookaheadLeakageDelta: Number(Math.abs(kimSmoothed - step.filteredCrisisProb).toFixed(4)),
    };
  });

  return {
    scenario,
    p11: 0.964,
    p22: 0.892,
    ...result,
    comparisonRows,
  };
}

const HRP_SYMBOLS = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'AVAX-PERP', 'PAXG-PERP'] as const;

const HRP_VOLS: Record<HrpRegimePreset, readonly number[]> = {
  BASELINE_CORR: [0.46, 0.54, 0.76, 0.82, 0.16],
  CRISIS_CONTAGION: [0.78, 0.88, 1.15, 1.24, 0.22],
  DECORRELATED_ALPHA: [0.38, 0.42, 0.55, 0.60, 0.15],
};

const HRP_CORR: Record<HrpRegimePreset, readonly (readonly number[])[]> = {
  BASELINE_CORR: [
    [1.0, 0.84, 0.76, 0.72, 0.12],
    [0.84, 1.0, 0.80, 0.75, 0.10],
    [0.76, 0.80, 1.0, 0.86, 0.08],
    [0.72, 0.75, 0.86, 1.0, 0.06],
    [0.12, 0.10, 0.08, 0.06, 1.0],
  ],
  CRISIS_CONTAGION: [
    [1.0, 0.95, 0.92, 0.91, 0.04],
    [0.95, 1.0, 0.94, 0.93, 0.03],
    [0.92, 0.94, 1.0, 0.96, 0.02],
    [0.91, 0.93, 0.96, 1.0, 0.02],
    [0.04, 0.03, 0.02, 0.02, 1.0],
  ],
  DECORRELATED_ALPHA: [
    [1.0, 0.45, 0.32, 0.28, -0.08],
    [0.45, 1.0, 0.38, 0.30, -0.05],
    [0.32, 0.38, 1.0, 0.42, -0.04],
    [0.28, 0.30, 0.42, 1.0, -0.02],
    [-0.08, -0.05, -0.04, -0.02, 1.0],
  ],
};

export function computeHrpAllocatorTelemetry(preset: HrpRegimePreset = 'BASELINE_CORR') {
  const hrp = computeHrpRecursiveBisection({
    symbols: HRP_SYMBOLS,
    volatilities: HRP_VOLS[preset],
    correlationMatrix: HRP_CORR[preset],
  });
  return {
    preset,
    ...hrp,
  };
}
