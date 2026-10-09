import { describe, it, expect } from 'vitest';
import { computeKyleObizhaevaSpread } from '@/tree/quantlib/microstructure/kyle-obizhaeva-spread-engine';

describe('Kyle-Obizhaeva (2018) Microstructure Invariance Spread Engine', () => {
  it('computes invariant spread and trade size from dollar volume and volatility', () => {
    const res = computeKyleObizhaevaSpread({
      dollarVolume: 100_000_000, // $100M daily volume
      volatility: 0.04, // 4% daily volatility
      price: 50_000, // BTC at $50k
    });

    expect(res.dimensionalGamma).toBeGreaterThan(0);
    expect(res.invariantSpread).toBeGreaterThan(0);
    expect(res.invariantSpreadBps).toBeGreaterThan(0);
    expect(res.invariantTradeSize).toBeGreaterThan(0);
    expect(res.invariantTradeCount).toBeGreaterThan(100);
  });

  it('reflects tighter spreads and larger trade counts in more liquid markets', () => {
    const liquid = computeKyleObizhaevaSpread({
      dollarVolume: 500_000_000,
      volatility: 0.02,
      price: 100,
    });
    const illiquid = computeKyleObizhaevaSpread({
      dollarVolume: 1_000_000,
      volatility: 0.08,
      price: 100,
    });

    expect(liquid.invariantSpreadBps).toBeLessThan(illiquid.invariantSpreadBps);
    expect(liquid.invariantTradeCount).toBeGreaterThan(illiquid.invariantTradeCount);
  });

  it('respects custom invariant scaling coefficients', () => {
    const standard = computeKyleObizhaevaSpread({
      dollarVolume: 10_000_000,
      volatility: 0.05,
      price: 2_000,
    });
    const custom = computeKyleObizhaevaSpread({
      dollarVolume: 10_000_000,
      volatility: 0.05,
      price: 2_000,
      invariantSpreadCoeff: 0.50,
      invariantSizeCoeff: 0.10,
    });

    expect(custom.invariantSpread).toBeCloseTo(standard.invariantSpread * 2, 4);
    expect(custom.invariantTradeSize).toBeCloseTo(standard.invariantTradeSize * 2, 4);
  });
});
