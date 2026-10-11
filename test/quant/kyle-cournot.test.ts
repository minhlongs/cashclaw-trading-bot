import { describe, it, expect } from 'vitest';
import { computeKyleCournotEquilibrium } from '@/tree/quantlib/microstructure/kyle-cournot-engine';

describe('Kyle (1989) Cournot Informed Trading Equilibrium Engine', () => {
  it('computes Cournot equilibrium with single and multiple informed traders', () => {
    const resSingle = computeKyleCournotEquilibrium({
      numInformedTraders: 1,
      assetVariance: 4.0,
      noiseVariance: 1.0,
      initialPrice: 100,
      fundamentalValue: 105,
    });

    expect(resSingle.traderAggressiveness).toBeGreaterThan(0);
    expect(resSingle.priceImpactLambda).toBeGreaterThan(0);
    expect(resSingle.marketDepth).toBeGreaterThan(0);
    expect(resSingle.clearingPrice).toBeGreaterThan(100);
    expect(resSingle.priceEfficiencyRatio).toBeCloseTo(0.5, 2);

    const resMulti = computeKyleCournotEquilibrium({
      numInformedTraders: 4,
      assetVariance: 4.0,
      noiseVariance: 1.0,
      initialPrice: 100,
      fundamentalValue: 105,
    });

    expect(resMulti.marketDepth).toBeGreaterThan(resSingle.marketDepth);
    expect(resMulti.priceEfficiencyRatio).toBeGreaterThan(resSingle.priceEfficiencyRatio);
    expect(resMulti.expectedTraderProfit).toBeLessThan(resSingle.expectedTraderProfit);
  });

  it('handles negative valuation shocks correctly', () => {
    const resDown = computeKyleCournotEquilibrium({
      numInformedTraders: 2,
      assetVariance: 2.0,
      noiseVariance: 1.0,
      initialPrice: 50,
      fundamentalValue: 45,
    });

    expect(resDown.aggregateInformedFlow).toBeLessThan(0);
    expect(resDown.clearingPrice).toBeLessThan(50);
  });
});
