import { describe, it, expect } from 'vitest';
import { computeAlmgrenChrissTrajectory } from './almgren-chriss-trajectory';

describe('Almgren-Chriss Optimal Execution Trajectory Kernel', () => {
  it('converges to linear PASSIVE_TWAP_LIMIT when riskAversionLambda approaches 0', () => {
    const res = computeAlmgrenChrissTrajectory({
      totalShares: 100,
      horizonSteps: 5,
      stepSeconds: 60,
      volatility: 0.02,
      riskAversionLambda: 0,
      tempImpactEta: 0.05,
      permImpactGamma: 0.01,
    });
    expect(res.urgencyKappa).toBe(0);
    expect(res.strategyClass).toBe('PASSIVE_TWAP_LIMIT');
    expect(res.trajectory).toHaveLength(5);
    expect(res.trajectory[0]?.sliceShares).toBeCloseTo(20, 3);
    expect(res.trajectory[4]?.remainingInventory).toBe(0);
  });

  it('produces BALANCED_AC_TRAJECTORY for moderate risk aversion', () => {
    const res = computeAlmgrenChrissTrajectory({
      totalShares: 100,
      horizonSteps: 5,
      stepSeconds: 1,
      volatility: 0.04,
      riskAversionLambda: 0.12,
      tempImpactEta: 0.02,
      permImpactGamma: 0.005,
    });
    expect(res.strategyClass).toBe('BALANCED_AC_TRAJECTORY');
    expect(res.firstSliceRatio).toBeGreaterThan(0.21);
    expect(res.firstSliceRatio).toBeLessThan(0.29);
  });

  it('produces URGENT_FRONT_LOADED schedule and monotonic inventory depletion for high risk aversion', () => {
    const res = computeAlmgrenChrissTrajectory({
      totalShares: 250,
      horizonSteps: 6,
      stepSeconds: 1,
      volatility: 0.05,
      riskAversionLambda: 0.85,
      tempImpactEta: 0.01,
      permImpactGamma: 0.005,
    });
    expect(res.strategyClass).toBe('URGENT_FRONT_LOADED');
    expect(res.firstSliceRatio).toBeGreaterThan(0.3);
    expect(res.expectedShortfallCost).toBeGreaterThan(0);
    expect(res.varianceShortfall).toBeGreaterThan(0);

    for (let i = 1; i < res.trajectory.length; i++) {
      expect(res.trajectory[i]!.remainingInventory).toBeLessThanOrEqual(
        res.trajectory[i - 1]!.remainingInventory,
      );
    }
    expect(res.trajectory[res.trajectory.length - 1]?.remainingInventory).toBe(0);
  });
});
