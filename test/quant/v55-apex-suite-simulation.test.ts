import { describe, it, expect } from 'vitest';
import { computeLehalleVolumeCurve } from '@/tree/quantlib/execution/lehalle-volume-curve-engine';
import { computeKyleCournotEquilibrium } from '@/tree/quantlib/microstructure/kyle-cournot-engine';
import { computeFoucaultEquilibrium } from '@/tree/quantlib/microstructure/foucault-equilibrium-engine';
import { computeAmihudMendelsonSpread } from '@/tree/quantlib/microstructure/amihud-mendelson-engine';

describe('Triad v55 Apex Multi-Domain Quantitative Suite E2E Simulation', () => {
  it('runs cross-domain execution, oligopoly pricing, limit order book & asset pricing pipeline', () => {
    // 1. Oligopoly Kyle Cournot market depth and price impact
    const kyle = computeKyleCournotEquilibrium({
      numInformedTraders: 3,
      assetVariance: 5.0,
      noiseVariance: 2.0,
      initialPrice: 100,
      fundamentalValue: 108,
    });
    expect(kyle.marketDepth).toBeGreaterThan(0);
    expect(kyle.priceImpactLambda).toBeGreaterThan(0);

    // 2. Foucault limit order equilibrium using informed flow uncertainty
    const foucault = computeFoucaultEquilibrium({
      assetVolatility: Math.sqrt(kyle.residualUncertainty),
      informedProportion: 0.3,
      holdingCost: 0.05,
      orderArrivalRate: 0.85,
      midPrice: kyle.clearingPrice,
    });
    expect(foucault.spread).toBeGreaterThan(0);
    expect(foucault.bid).toBeLessThan(kyle.clearingPrice);
    expect(foucault.ask).toBeGreaterThan(kyle.clearingPrice);

    // 3. Amihud-Mendelson clientele required returns based on Foucault equilibrium spread
    const relativeSpread = foucault.spread / kyle.clearingPrice;
    const amihud = computeAmihudMendelsonSpread({
      baseYield: 0.06,
      spreadPct: relativeSpread,
      investorHorizons: [0.25, 0.5, 1.0, 2.0, 5.0],
    });
    expect(amihud.liquidityPremiumBps).toBeGreaterThan(0);
    expect(amihud.equilibriumReturn).toBeGreaterThan(0.06);

    // 4. Lehalle volume curve scheduling for institutional rebalancing
    const lehalle = computeLehalleVolumeCurve({
      totalShares: 25_000,
      initialPrice: kyle.clearingPrice,
      volumeCurve: [0.15, 0.25, 0.35, 0.15, 0.10],
      temporaryImpact: kyle.priceImpactLambda * 0.1,
      trackingAversion: 1.5,
    });
    expect(lehalle.schedule).toHaveLength(5);
    const totalExecuted = lehalle.schedule.reduce((acc, s) => acc + s.allocatedShares, 0);
    expect(totalExecuted).toBeCloseTo(25_000, 2);
    expect(lehalle.schedule[4]!.remainingShares).toBe(0);
  });
});
