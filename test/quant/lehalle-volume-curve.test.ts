import { describe, it, expect } from 'vitest';
import { computeLehalleVolumeCurve } from '@/tree/quantlib/execution/lehalle-volume-curve-engine';

describe('Lehalle (2009) Multi-Period Optimal Volume Curve Tracking Engine', () => {
  it('allocates total shares across volume profile matching target fraction', () => {
    const res = computeLehalleVolumeCurve({
      totalShares: 10_000,
      initialPrice: 100,
      volumeCurve: [0.1, 0.2, 0.4, 0.2, 0.1],
      temporaryImpact: 0.05,
      trackingAversion: 1.0,
    });

    expect(res.schedule).toHaveLength(5);
    const totalTraded = res.schedule.reduce((acc, s) => acc + s.allocatedShares, 0);
    expect(totalTraded).toBeCloseTo(10_000, 2);
    expect(res.schedule[4]!.remainingShares).toBe(0);
    expect(res.effectivePrice).toBeLessThanOrEqual(100);
    expect(res.vwapTrackingErrorBps).toBeGreaterThanOrEqual(0);
    expect(res.objectiveUtility).toBeGreaterThan(0);
  });

  it('handles edge cases of zero volume curve or single period', () => {
    const resSingle = computeLehalleVolumeCurve({
      totalShares: 1_000,
      initialPrice: 50,
      volumeCurve: [1],
    });
    expect(resSingle.schedule).toHaveLength(1);
    expect(resSingle.schedule[0]!.allocatedShares).toBe(1_000);

    const resZeroShares = computeLehalleVolumeCurve({
      totalShares: 0,
      initialPrice: 100,
      volumeCurve: [10, 20],
    });
    expect(resZeroShares.totalCost).toBe(0);
    expect(resZeroShares.effectivePrice).toBe(100);
  });

  it('penalizes deviation when tracking aversion is high', () => {
    const lowAversion = computeLehalleVolumeCurve({
      totalShares: 5_000,
      initialPrice: 100,
      volumeCurve: [0.1, 0.8, 0.1],
      trackingAversion: 0.01,
    });
    const highAversion = computeLehalleVolumeCurve({
      totalShares: 5_000,
      initialPrice: 100,
      volumeCurve: [0.1, 0.8, 0.1],
      trackingAversion: 10.0,
    });

    expect(highAversion.vwapTrackingErrorBps).toBeLessThan(lowAversion.vwapTrackingErrorBps);
  });
});
