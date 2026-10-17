import { describe, it, expect } from 'vitest';
import { RollEffectiveSpreadEngine, computeRollSpread } from './roll-effective-spread-engine';

describe('RollEffectiveSpreadEngine (Roll 1984)', () => {
  it('returns zero values when price series is too short (<3 observations)', () => {
    const engine = new RollEffectiveSpreadEngine();
    const res = engine.estimateSpread([100, 101]);
    expect(res.numObservations).toBe(2);
    expect(res.rollSpread).toBe(0);
    expect(res.effectiveSpreadPct).toBe(0);
    expect(res.isAutocovarianceNegative).toBe(false);
  });

  it('computes effective spread when autocovariance is negative (bid-ask bounce)', () => {
    const engine = new RollEffectiveSpreadEngine({ tickSize: 0.01 });
    // Bouncing prices: 100, 101, 100, 101, 100
    const prices = [100, 101, 100, 101, 100, 101];
    const res = engine.estimateSpread(prices);
    expect(res.numObservations).toBe(6);
    expect(res.isAutocovarianceNegative).toBe(true);
    expect(res.autocovariance).toBeLessThan(0);
    expect(res.rollSpread).toBeGreaterThan(0);
    expect(res.effectiveSpreadPct).toBeGreaterThan(0);
  });

  it('returns zero spread when autocovariance is positive (trending series)', () => {
    const prices = [100, 101, 102, 103, 104, 105];
    const res = computeRollSpread({ priceSeries: prices });
    expect(res.isAutocovarianceNegative).toBe(false);
    expect(res.rollSpread).toBe(0);
    expect(res.effectiveSpreadPct).toBe(0);
  });
});
