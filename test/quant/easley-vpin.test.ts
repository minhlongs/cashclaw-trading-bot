import { describe, it, expect } from 'vitest';
import { computeEasleyVpin } from '../../src/tree/quantlib/microstructure/easley-vpin-engine';

describe('Easley, López de Prado & O\'Hara (2012) VPIN Engine', () => {
  it('computes volume-synchronized toxicity metric over trade stream', () => {
    const trades = [
      { size: 100, priceChange: 0.5 },
      { size: 120, priceChange: -0.4 },
      { size: 80, priceChange: 0.2 },
      { size: 150, priceChange: -0.8 },
      { size: 200, priceChange: -1.2 },
      { size: 90, priceChange: 0.1 },
    ];

    const res = computeEasleyVpin({
      trades,
      bucketVolume: 100,
      numBuckets: 5,
      priceStdDev: 0.5,
    });

    expect(res.totalBuckets).toBeGreaterThanOrEqual(5);
    expect(res.vpin).toBeGreaterThanOrEqual(0);
    expect(res.vpin).toBeLessThanOrEqual(1);
    expect(['low', 'moderate', 'high', 'extreme']).toContain(res.toxicityLevel);
    expect(res.averageImbalance).toBeGreaterThan(0);
  });

  it('handles empty trades or zero bucket volume gracefully', () => {
    const emptyRes = computeEasleyVpin({
      trades: [],
      bucketVolume: 100,
    });
    expect(emptyRes.vpin).toBe(0);
    expect(emptyRes.toxicityLevel).toBe('low');
    expect(emptyRes.totalBuckets).toBe(0);
  });
});
