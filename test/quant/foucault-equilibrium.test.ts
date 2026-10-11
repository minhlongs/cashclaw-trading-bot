import { describe, it, expect } from 'vitest';
import { computeFoucaultEquilibrium } from '@/tree/quantlib/microstructure/foucault-equilibrium-engine';

describe('Foucault (1999) Winner\'s Curse Limit Order Equilibrium Engine', () => {
  it('computes equilibrium spread and fill probabilities under asymmetric information', () => {
    const res = computeFoucaultEquilibrium({
      assetVolatility: 2.0,
      informedProportion: 0.25,
      holdingCost: 0.05,
      orderArrivalRate: 0.8,
      midPrice: 100,
    });

    expect(res.halfSpread).toBeGreaterThan(0);
    expect(res.bid).toBeLessThan(100);
    expect(res.ask).toBeGreaterThan(100);
    expect(res.spread).toBeCloseTo(res.halfSpread * 2, 4);
    expect(res.fillProbability).toBeGreaterThan(0);
    expect(res.fillProbability).toBeLessThanOrEqual(1);
    expect(res.winnersCurseBps).toBeGreaterThan(0);
    expect(res.marketOrderProb).toBeCloseTo(1 - res.fillProbability, 4);
  });

  it('widens spread and increases winners curse as informed proportion increases', () => {
    const lowInformed = computeFoucaultEquilibrium({
      assetVolatility: 1.5,
      informedProportion: 0.1,
      midPrice: 100,
    });
    const highInformed = computeFoucaultEquilibrium({
      assetVolatility: 1.5,
      informedProportion: 0.4,
      midPrice: 100,
    });

    expect(highInformed.spread).toBeGreaterThan(lowInformed.spread);
    expect(highInformed.winnersCurseBps).toBeGreaterThan(lowInformed.winnersCurseBps);
    expect(highInformed.fillProbability).toBeLessThan(lowInformed.fillProbability);
  });
});
