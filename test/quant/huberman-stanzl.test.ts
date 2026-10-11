import { describe, it, expect } from 'vitest';
import { computeHubermanStanzlManipulation } from '@/tree/quantlib/execution/huberman-stanzl-manipulation-engine';

describe('Huberman & Stanzl (2004) Price Manipulation & Non-Arbitrage Engine', () => {
  it('computes linear permanent and decaying transient price impact trajectory', () => {
    const res = computeHubermanStanzlManipulation({
      tradeTrajectory: [100, 200, 150, -50],
      initialPrice: 50,
      permanentImpactFactor: 0.01,
      transientImpactFactor: 0.02,
      decayRate: 0.6,
    });

    expect(res.schedule).toHaveLength(4);
    expect(res.isQuasiArbitrageFree).toBe(true);
    expect(res.permanentImpactCost).toBeGreaterThan(0);
    expect(res.transientImpactCost).toBeGreaterThan(0);
    expect(res.totalCost).toBeGreaterThan(0);
    expect(res.effectivePrice).toBeGreaterThan(50);
    expect(res.schedule[0]!.price).toBeCloseTo(50 + 100 * 0.01, 4);
    expect(res.schedule[3]!.cumulativeShares).toBe(400);
  });

  it('detects round-trip trade trajectory without price manipulation arbitrage', () => {
    const roundTrip = computeHubermanStanzlManipulation({
      tradeTrajectory: [100, 50, -100, -50],
      initialPrice: 100,
      permanentImpactFactor: 0.05,
      transientImpactFactor: 0.02,
      decayRate: 0.5,
    });

    expect(roundTrip.schedule[3]!.cumulativeShares).toBe(0);
    // Non-arbitrage theorem: round trip cost must be non-negative
    expect(roundTrip.roundTripCost).toBeGreaterThanOrEqual(0);
    expect(roundTrip.isQuasiArbitrageFree).toBe(true);
  });

  it('handles empty trajectory and default parameters gracefully', () => {
    const empty = computeHubermanStanzlManipulation({
      tradeTrajectory: [],
      initialPrice: 100,
      permanentImpactFactor: 0.01,
    });

    expect(empty.schedule).toHaveLength(0);
    expect(empty.totalCost).toBe(0);
    expect(empty.effectivePrice).toBe(100);
    expect(empty.isQuasiArbitrageFree).toBe(true);
  });
});
