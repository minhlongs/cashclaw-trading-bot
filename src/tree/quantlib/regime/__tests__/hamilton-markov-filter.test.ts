import { describe, it, expect } from 'vitest';
import { runHamiltonMarkovFilter } from '../hamilton-markov-filter';

const BASE_PARAMS = {
  p11: 0.96,
  p22: 0.88,
  mu1: 0.002,
  sigma1: 0.008,
  mu2: -0.018,
  sigma2: 0.042,
};

describe('Hamilton (1989) Causal Markov-Switching Regime Filter', () => {
  it('conserves probability (xi_1 + xi_2 = 1) and computes exact ergodic stationary weights & durations', () => {
    const res = runHamiltonMarkovFilter({
      ...BASE_PARAMS,
      returns: [0.001, 0.003, -0.002, 0.004, -0.038, -0.052],
    });

    expect(res.ergodicLowVolPi1 + res.ergodicCrisisPi2).toBeCloseTo(1, 5);
    expect(res.ergodicLowVolPi1).toBeCloseTo(0.12 / 0.16, 4);
    expect(res.expectedDurationLowVol).toBeCloseTo(25, 1);
    expect(res.expectedDurationCrisis).toBeCloseTo(8.33, 1);

    for (const step of res.steps) {
      expect(step.predictedLowVolProb + step.predictedCrisisProb).toBeCloseTo(1, 5);
      expect(step.filteredLowVolProb + step.filteredCrisisProb).toBeCloseTo(1, 5);
      expect(step.sizingMultiplier).toBeGreaterThanOrEqual(0.15);
      expect(step.sizingMultiplier).toBeLessThanOrEqual(1.0);
    }
  });

  it('detects high-volatility crisis spikes and throttles dynamic paper sizing multiplier', () => {
    const calmThenCrisis = [0.002, 0.001, 0.003, 0.002, -0.048, -0.062, 0.055];
    const res = runHamiltonMarkovFilter({
      ...BASE_PARAMS,
      returns: calmThenCrisis,
    });

    expect(res.steps[2]?.activeState).toBe('LOW_VOL_BULL');
    expect(res.steps[2]?.filteredCrisisProb).toBeLessThan(0.15);
    expect(res.latestState).toBe('HIGH_VOL_CRISIS');
    expect(res.latestCrisisProb).toBeGreaterThan(0.85);
    expect(res.latestSizingMultiplier).toBeLessThan(0.3);
    expect(res.likelihoodRatio2DeltaL).toBeGreaterThan(0);
  });

  it('enforces strict causality: appending future shocks at t+1 never alters filtered xi_{t|t}', () => {
    const prefixReturns = [0.002, -0.001, 0.003, -0.012, 0.004];
    const extendedReturns = [...prefixReturns, -0.085, -0.092, 0.074];

    const prefixResult = runHamiltonMarkovFilter({
      ...BASE_PARAMS,
      returns: prefixReturns,
    });
    const extendedResult = runHamiltonMarkovFilter({
      ...BASE_PARAMS,
      returns: extendedReturns,
    });

    for (let t = 0; t < prefixReturns.length; t++) {
      expect(extendedResult.steps[t]).toEqual(prefixResult.steps[t]);
    }
  });
});
