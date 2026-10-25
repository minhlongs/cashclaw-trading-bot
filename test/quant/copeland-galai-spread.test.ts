import { describe, it, expect } from 'vitest';
import { computeCopelandGalaiSpread } from '@/tree/quantlib/microstructure/copeland-galai-engine';
import type { CopelandGalaiParams } from '@/tree/quantlib/microstructure/copeland-galai-engine';

describe('Copeland-Galai (1983) Options Model of Spread Engine', () => {
  it('computes positive equilibrium spread covering dealer option liability and order handling cost', () => {
    const params: CopelandGalaiParams = {
      assetPrice: 100,
      volatility: 0.3,
      timeToQuoteExpirySec: 60,
      informedTraderFraction: 0.2,
      orderHandlingCost: 0.05,
    };

    const res = computeCopelandGalaiSpread(params);
    expect(res.equilibriumSpread).toBeGreaterThan(0);
    expect(res.halfSpread).toBe(res.equilibriumSpread / 2);
    expect(res.callOptionLiability).toBeGreaterThan(0);
    expect(res.putOptionLiability).toBeGreaterThan(0);
    expect(res.optimalBid).toBeLessThan(100);
    expect(res.optimalAsk).toBeGreaterThan(100);
    expect(res.uninformedRevenueRatio).toBeGreaterThan(0);
  });

  it('spread increases monotonically with higher fraction of informed traders', () => {
    const lowInformed = computeCopelandGalaiSpread({
      assetPrice: 50,
      volatility: 0.25,
      timeToQuoteExpirySec: 120,
      informedTraderFraction: 0.1,
      orderHandlingCost: 0.02,
    });

    const highInformed = computeCopelandGalaiSpread({
      assetPrice: 50,
      volatility: 0.25,
      timeToQuoteExpirySec: 120,
      informedTraderFraction: 0.4,
      orderHandlingCost: 0.02,
    });

    expect(highInformed.equilibriumSpread).toBeGreaterThan(lowInformed.equilibriumSpread);
    expect(highInformed.optimalAsk - highInformed.optimalBid).toBeGreaterThan(
      lowInformed.optimalAsk - lowInformed.optimalBid
    );
  });

  it('spread increases with higher volatility due to dealer option risk', () => {
    const lowVol = computeCopelandGalaiSpread({
      assetPrice: 100,
      volatility: 0.1,
      timeToQuoteExpirySec: 60,
      informedTraderFraction: 0.2,
      orderHandlingCost: 0.01,
    });

    const highVol = computeCopelandGalaiSpread({
      assetPrice: 100,
      volatility: 0.8,
      timeToQuoteExpirySec: 60,
      informedTraderFraction: 0.2,
      orderHandlingCost: 0.01,
    });

    expect(highVol.equilibriumSpread).toBeGreaterThan(lowVol.equilibriumSpread);
    expect(highVol.callOptionLiability).toBeGreaterThan(lowVol.callOptionLiability);
  });
});
