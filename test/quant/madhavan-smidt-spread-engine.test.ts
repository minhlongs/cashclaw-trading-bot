import { describe, expect, it } from 'vitest';
import { computeMadhavanSmidtDecomposition } from '../../src/tree/quantlib/microstructure/madhavan-smidt-spread-engine';
import type { MadhavanSmidtTick } from '../../src/tree/quantlib/microstructure/madhavan-smidt-spread-types';

describe('Madhavan-Smidt (1991) Spread Econometric Decomposition Engine', () => {
  it('handles small tick history (<4 ticks) with fallback values', () => {
    const ticks: MadhavanSmidtTick[] = [
      { price: 100, midpoint: 100, direction: 1 },
      { price: 100.5, midpoint: 100, direction: 1 },
    ];
    const res = computeMadhavanSmidtDecomposition(ticks);
    expect(res.spread).toBe(0);
    expect(res.adverseSelectionCoeff).toBe(0);
    expect(res.orderProcessingCost).toBe(0);
  });

  it('preserves share partition summation invariant close to 1', () => {
    const ticks: MadhavanSmidtTick[] = [
      { price: 100.0, midpoint: 100.0, direction: 1, inventory: 5 },
      { price: 100.2, midpoint: 100.05, direction: 1, inventory: 4 },
      { price: 99.8, midpoint: 99.95, direction: -1, inventory: 5 },
      { price: 100.1, midpoint: 100.0, direction: 1, inventory: 3 },
      { price: 99.7, midpoint: 99.9, direction: -1, inventory: 4 },
      { price: 100.3, midpoint: 100.1, direction: 1, inventory: 2 },
    ];
    const res = computeMadhavanSmidtDecomposition(ticks);
    expect(res.orderProcessingShare).toBeGreaterThanOrEqual(0);
    expect(res.adverseSelectionShare).toBeGreaterThanOrEqual(0);
    expect(res.inventoryHoldingShare).toBeGreaterThanOrEqual(0);
    const sum = res.orderProcessingShare + res.adverseSelectionShare + res.inventoryHoldingShare;
    expect(sum).toBeCloseTo(1.0, 4);
    expect(res.rSquared).toBeGreaterThanOrEqual(0);
    expect(res.rSquared).toBeLessThanOrEqual(1.0);
  });

  it('uses spread override if provided', () => {
    const ticks: MadhavanSmidtTick[] = [
      { price: 50.0, midpoint: 50.0, direction: 1 },
      { price: 50.1, midpoint: 50.05, direction: 1 },
      { price: 49.9, midpoint: 49.95, direction: -1 },
      { price: 50.2, midpoint: 50.1, direction: 1 },
      { price: 49.8, midpoint: 49.9, direction: -1 },
    ];
    const res = computeMadhavanSmidtDecomposition(ticks, 0.4);
    expect(res.spread).toBe(0.4);
  });
});
