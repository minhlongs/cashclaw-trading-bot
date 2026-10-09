import { describe, expect, it } from 'vitest';
import { computeBiaisHillionSpattMicrostructure } from '@/tree/quantlib/microstructure/biais-hillion-spatt-engine';

describe('Biais-Hillion-Spatt (1995) Order Flow Dynamics & State-Dependent Liquidity Engine', () => {
  it('computes higher limit order probability at touch when spread is wide', () => {
    const wideSpread = computeBiaisHillionSpattMicrostructure({
      spreadTicks: 10,
      bidDepth: 100,
      askDepth: 100,
      baseArrivalRate: 20,
      spreadSensitivity: 0.5,
      depthSensitivity: 0.2,
    });

    const tightSpread = computeBiaisHillionSpattMicrostructure({
      spreadTicks: 1,
      bidDepth: 100,
      askDepth: 100,
      baseArrivalRate: 20,
      spreadSensitivity: 0.5,
      depthSensitivity: 0.2,
    });

    expect(wideSpread.probLimitOrderAtTouch).toBeGreaterThan(tightSpread.probLimitOrderAtTouch);
    expect(wideSpread.liquidityReplenishmentRate).toBeGreaterThan(tightSpread.liquidityReplenishmentRate);
    expect(wideSpread.resiliencyHalfLife).toBeLessThan(tightSpread.resiliencyHalfLife);
  });

  it('evaluates probabilities summing to 1', () => {
    const res = computeBiaisHillionSpattMicrostructure({
      spreadTicks: 3,
      bidDepth: 50,
      askDepth: 50,
      baseArrivalRate: 15,
      spreadSensitivity: 0.3,
      depthSensitivity: 0.1,
    });

    const sum = res.probLimitOrderAtTouch + res.probMarketOrder + res.probCancellation;
    expect(sum).toBeCloseTo(1.0, 5);
    expect(res.spreadWideningRisk).toBeGreaterThan(0);
    expect(res.spreadWideningRisk).toBeLessThanOrEqual(1.0);
  });

  it('handles low depth and minimum spread boundaries', () => {
    const res = computeBiaisHillionSpattMicrostructure({
      spreadTicks: 1,
      bidDepth: 0,
      askDepth: 1,
      baseArrivalRate: 10,
      spreadSensitivity: 0.1,
      depthSensitivity: 0.1,
    });

    expect(res.probLimitOrderAtTouch).toBeGreaterThan(0);
    expect(res.probMarketOrder).toBeGreaterThan(0);
    expect(res.probCancellation).toBeGreaterThan(0);
    expect(res.resiliencyHalfLife).toBeGreaterThan(0);
  });
});
