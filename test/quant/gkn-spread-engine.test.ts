import { describe, it, expect } from 'vitest';
import { computeGKNSpreadDecomposition } from '@/tree/quantlib/microstructure/gkn-spread-engine';
import type { GKNPriceBar } from '@/tree/quantlib/microstructure/gkn-spread-types';

describe('George-Kaul-Nimalendran (GKN 1991) Spread Decomposition Engine', () => {
  it('returns neutral default allocation for short series (< 4 bars)', () => {
    const bars: GKNPriceBar[] = [{ price: 100, midpoint: 100 }, { price: 101, midpoint: 100.5 }];
    const res = computeGKNSpreadDecomposition(bars);
    expect(res.spread).toBe(0);
    expect(res.orderProcessingShare).toBe(0.5);
    expect(res.adverseSelectionShare).toBe(0.5);
  });

  it('guarantees strict partition invariant alpha + gamma = 1.0', () => {
    const bars: GKNPriceBar[] = [
      { price: 100.2, midpoint: 100.0 },
      { price: 99.8, midpoint: 100.1 },
      { price: 100.3, midpoint: 99.9 },
      { price: 99.7, midpoint: 100.0 },
      { price: 100.4, midpoint: 100.2 },
      { price: 99.6, midpoint: 100.1 },
    ];
    const res = computeGKNSpreadDecomposition(bars);
    expect(res.orderProcessingShare + res.adverseSelectionShare).toBeCloseTo(1.0, 6);
    expect(res.orderProcessingShare).toBeGreaterThanOrEqual(0.0);
    expect(res.orderProcessingShare).toBeLessThanOrEqual(1.0);
    expect(res.spread).toBeGreaterThan(0);
  });

  it('respects optional spreadOverride parameter', () => {
    const bars: GKNPriceBar[] = [
      { price: 100, midpoint: 100 },
      { price: 102, midpoint: 101 },
      { price: 99, midpoint: 100 },
      { price: 103, midpoint: 101 },
      { price: 98, midpoint: 100 },
    ];
    const res = computeGKNSpreadDecomposition(bars, 0.05);
    expect(res.spread).toBe(0.05);
    expect(res.orderProcessingShare + res.adverseSelectionShare).toBeCloseTo(1.0, 6);
  });
});
