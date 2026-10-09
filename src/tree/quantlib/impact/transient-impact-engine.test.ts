import { describe, it, expect } from 'vitest';
import { TransientImpactEngine } from './transient-impact-engine';
import type { ImpactExecutionSlice } from './transient-impact-types';

describe('TransientImpactEngine', () => {
  const engine = new TransientImpactEngine({ gamma: 0.001, alpha: 0.5, epsilon: 1.0 });

  it('computes transient impact decay across time intervals', () => {
    const slices: ImpactExecutionSlice[] = [
      { time: 0, quantity: 10 },
      { time: 10, quantity: 10 },
      { time: 20, quantity: 10 },
    ];

    const res = engine.evaluateImpactTrajectory(slices, 50000);

    expect(res.trajectoryProfile.length).toBe(3);
    expect(res.instantaneousImpactBps).toBeGreaterThan(0);
    expect(res.totalExecutionSlippageCost).toBeGreaterThan(0);
    expect(res.accumulatedPriceImpactBps).toBeGreaterThan(res.instantaneousImpactBps);
  });

  it('returns zero impact when empty slices or invalid mid price provided', () => {
    const emptyRes = engine.evaluateImpactTrajectory([], 50000);
    expect(emptyRes.instantaneousImpactBps).toBe(0);
    expect(emptyRes.trajectoryProfile).toEqual([]);

    const badPriceRes = engine.evaluateImpactTrajectory([{ time: 0, quantity: 1 }], 0);
    expect(badPriceRes.instantaneousImpactBps).toBe(0);
  });
});
