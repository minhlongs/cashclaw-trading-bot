import { describe, it, expect } from 'vitest';
import { computeContKukanovOfi } from '@/tree/quantlib/microstructure/cont-kukanov-ofi-engine';

describe('ContKukanovOfi (2014) Engine', () => {
  it('computes multi-level order flow imbalance correctly', () => {
    const prevLevels = [
      { bidPrice: 100, bidSize: 10, askPrice: 101, askSize: 10 },
      { bidPrice: 99, bidSize: 20, askPrice: 102, askSize: 20 },
    ];
    const currLevels = [
      { bidPrice: 100, bidSize: 15, askPrice: 101, askSize: 8 }, // +5 bid OFI, -(-2) ask OFI = +7
      { bidPrice: 99.5, bidSize: 10, askPrice: 102, askSize: 25 }, // bid higher price (+10), ask unchanged (+5) = 10 - 5 = +5
    ];

    const res = computeContKukanovOfi({
      prevLevels,
      currLevels,
      decayBeta: 0.5,
      impactMultiplier: 0.2,
    });

    expect(res.levelOfis.length).toBe(2);
    expect(res.levelOfis[0]).toBe(7);
    expect(res.levelOfis[1]).toBe(5);
    expect(res.totalOfi).toBeGreaterThan(0);
    expect(res.predictedPriceImpact).toBeCloseTo(res.totalOfi * 0.2);
    expect(res.depthImbalance).toBeDefined();
  });

  it('handles empty levels safely', () => {
    const res = computeContKukanovOfi({ prevLevels: [], currLevels: [] });
    expect(res.levelOfis).toEqual([]);
    expect(res.totalOfi).toBe(0);
    expect(res.predictedPriceImpact).toBe(0);
    expect(res.depthImbalance).toBe(0);
  });
});
