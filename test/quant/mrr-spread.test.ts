import { describe, it, expect } from 'vitest';
import { computeMrrSpread } from '@/tree/quantlib/microstructure/mrr-spread-engine';

describe('Madhavan-Richardson-Roomans (1997) Spread Decomposition Engine', () => {
  it('decomposes bid-ask spread into order processing and adverse selection components', () => {
    // Simulated price series with order flow autocorrelation and informative shocks
    const prices = [100.0, 100.05, 100.04, 100.1, 100.08, 100.15, 100.12, 100.2];
    const tradeSigns = [1, 1, -1, 1, -1, 1, -1, 1];

    const res = computeMrrSpread({ prices, tradeSigns });

    expect(res.sampleSize).toBe(prices.length - 1);
    expect(res.effectiveSpread).toBeGreaterThan(0);
    expect(res.adverseSelection).toBeGreaterThanOrEqual(0);
    expect(res.orderProcessing).toBeGreaterThanOrEqual(0);
    expect(res.tradeAutocorrelation).toBeGreaterThanOrEqual(-1);
    expect(res.tradeAutocorrelation).toBeLessThanOrEqual(1);
    expect(res.effectiveSpread).toBeCloseTo(2 * (res.adverseSelection + res.orderProcessing), 4);
  });

  it('infers trade signs from tick direction when not explicitly provided', () => {
    const prices = [50.0, 50.1, 50.05, 50.15, 50.2, 50.1];
    const res = computeMrrSpread({ prices });

    expect(res.sampleSize).toBe(5);
    expect(res.effectiveSpread).toBeGreaterThan(0);
    expect(res.adverseSelection).toBeGreaterThanOrEqual(0);
  });

  it('handles degenerate cases with insufficient data gracefully', () => {
    const emptyRes = computeMrrSpread({ prices: [] });
    expect(emptyRes.sampleSize).toBe(0);
    expect(emptyRes.effectiveSpread).toBe(0);
    expect(emptyRes.adverseSelection).toBe(0);
    expect(emptyRes.orderProcessing).toBe(0);

    const twoPointRes = computeMrrSpread({ prices: [100, 101] });
    expect(twoPointRes.sampleSize).toBe(0);
    expect(twoPointRes.effectiveSpread).toBe(0);
  });
});
