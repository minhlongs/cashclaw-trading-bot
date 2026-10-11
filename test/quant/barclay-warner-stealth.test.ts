import { describe, it, expect } from 'vitest';
import { computeBarclayWarnerStealth } from '../../src/tree/quantlib/microstructure/barclay-warner-stealth-engine';

describe('Barclay & Warner (1995) Stealth Trading Engine', () => {
  it('correctly partitions trades into small, medium, and large size buckets', () => {
    const trades = [
      { size: 10, priceChange: 0.05 },
      { size: 20, priceChange: 0.05 },
      { size: 100, priceChange: 0.50 },
      { size: 120, priceChange: 0.60 },
      { size: 110, priceChange: 0.40 },
      { size: 500, priceChange: 0.10 },
      { size: 600, priceChange: 0.00 },
    ];
    const res = computeBarclayWarnerStealth({ trades, smallCutoff: 50, largeCutoff: 300 });

    expect(res.totalTrades).toBe(7);
    expect(res.smallBucket.tradeCount).toBe(2);
    expect(res.mediumBucket.tradeCount).toBe(3);
    expect(res.largeBucket.tradeCount).toBe(2);
    expect(res.mediumBucket.cpcFraction).toBeGreaterThan(res.smallBucket.cpcFraction);
    expect(res.mediumBucket.cpcFraction).toBeGreaterThan(res.largeBucket.cpcFraction);
    expect(res.dominantStealthBucket).toBe('medium');
  });

  it('handles empty trades list gracefully', () => {
    const res = computeBarclayWarnerStealth({ trades: [] });
    expect(res.totalTrades).toBe(0);
    expect(res.smallBucket.tradeCount).toBe(0);
    expect(res.dominantStealthBucket).toBe('medium');
  });
});
