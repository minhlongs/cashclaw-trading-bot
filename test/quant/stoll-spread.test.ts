import { describe, it, expect } from 'vitest';
import { computeStollSpread } from '../../src/tree/quantlib/microstructure/stoll-spread-engine';

describe('Stoll (1989) Three-Component Covariance Spread Decomposition Engine', () => {
  it('decomposes effective spread into adverse selection, inventory, and order processing', () => {
    const ticks = [
      { price: 100.1, midpoint: 100.0 },
      { price: 99.9, midpoint: 100.0 },
      { price: 100.2, midpoint: 100.05 },
      { price: 99.8, midpoint: 99.95 },
      { price: 100.1, midpoint: 100.0 },
      { price: 99.9, midpoint: 100.0 },
      { price: 100.2, midpoint: 100.05 },
      { price: 99.8, midpoint: 99.95 },
    ];

    const res = computeStollSpread({ ticks });
    expect(res.effectiveSpread).toBeGreaterThan(0);
    expect(res.adverseSelectionFraction).toBeGreaterThanOrEqual(0);
    expect(res.inventoryHoldingFraction).toBeGreaterThanOrEqual(0);
    expect(res.orderProcessingFraction).toBeGreaterThanOrEqual(0);
    const sum = res.adverseSelectionFraction + res.inventoryHoldingFraction + res.orderProcessingFraction;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('handles few ticks gracefully', () => {
    const emptyRes = computeStollSpread({ ticks: [{ price: 100, midpoint: 100 }] });
    expect(emptyRes.effectiveSpread).toBe(0);
    expect(emptyRes.orderProcessingFraction).toBe(1);
  });
});
