import { describe, it, expect } from 'vitest';
import { BessembinderKaufmanEngine } from '@/tree/quantlib/microstructure/bessembinder-kaufman-engine';
import type { TradeQuotePair } from '@/tree/quantlib/microstructure/bessembinder-kaufman-types';

describe('BessembinderKaufmanEngine', () => {
  it('throws on empty trade list', () => {
    expect(() => BessembinderKaufmanEngine.calculate({ pairs: [] })).toThrow('At least one trade-quote pair is required');
  });

  it('throws on non-positive prices or midpoints', () => {
    const pair: TradeQuotePair = { tradePrice: -10, tradeSign: 1, prevailingMid: 100, futureMid: 101 };
    expect(() => BessembinderKaufmanEngine.calculate({ pairs: [pair] })).toThrow('Prices and midpoints must be positive');
  });

  it('decomposes effective spread into realized spread and price impact', () => {
    // Buy trade at 101, prevailing mid is 100, future mid after 5 mins is 100.5
    // Effective half-spread = 1 * (101 - 100) = 1.0
    // Realized half-spread = 1 * (101 - 100.5) = 0.5
    // Price impact = 1 * (100.5 - 100) = 0.5
    const pairs: TradeQuotePair[] = [
      { tradePrice: 101, tradeSign: 1, prevailingMid: 100, futureMid: 100.5 },
      { tradePrice: 99, tradeSign: -1, prevailingMid: 100, futureMid: 99.5 },
    ];
    const res = BessembinderKaufmanEngine.calculate({ pairs });
    expect(res.pairCount).toBe(2);
    expect(res.effectiveHalfSpread).toBeCloseTo(1.0, 5);
    expect(res.realizedHalfSpread).toBeCloseTo(0.5, 5);
    expect(res.priceImpact).toBeCloseTo(0.5, 5);
    // Identity: Effective = Realized + Price Impact
    expect(res.effectiveHalfSpread).toBeCloseTo(res.realizedHalfSpread + res.priceImpact, 5);
  });
});
