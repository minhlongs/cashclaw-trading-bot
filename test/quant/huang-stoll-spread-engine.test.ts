import { describe, expect, it } from 'vitest';
import { computeHuangStollDecomposition } from '@/tree/quantlib/microstructure/huang-stoll-spread-engine';
import type { HuangStollTradeTick } from '@/tree/quantlib/microstructure/huang-stoll-spread-types';

describe('Huang-Stoll (1997) 3-Way Spread Decomposition Engine', () => {
  it('returns empty fallback result when tick sample is insufficient (< 3 ticks)', () => {
    const res = computeHuangStollDecomposition([
      { midpoint: 100, tradeDirection: 1 },
      { midpoint: 100.1, tradeDirection: -1 },
    ]);
    expect(res.spread).toBe(0);
    expect(res.orderProcessingShare).toBe(0);
    expect(res.inventoryHoldingShare).toBe(0);
    expect(res.adverseSelectionShare).toBe(0);
    expect(res.tradeContinuationProb).toBe(0.5);
  });

  it('guarantees 3-way shares sum strictly to 1.0 (alpha + beta + gamma = 1.0)', () => {
    const ticks: HuangStollTradeTick[] = [
      { midpoint: 100.0, tradeDirection: 1, price: 100.1 },
      { midpoint: 100.05, tradeDirection: 1, price: 100.15 },
      { midpoint: 100.08, tradeDirection: -1, price: 99.98 },
      { midpoint: 100.04, tradeDirection: -1, price: 99.95 },
      { midpoint: 100.02, tradeDirection: 1, price: 100.12 },
      { midpoint: 100.06, tradeDirection: 1, price: 100.18 },
    ];
    const res = computeHuangStollDecomposition(ticks);
    const sum = res.orderProcessingShare + res.inventoryHoldingShare + res.adverseSelectionShare;
    expect(sum).toBeCloseTo(1.0, 6);
    expect(res.orderProcessingShare).toBeGreaterThanOrEqual(0);
    expect(res.inventoryHoldingShare).toBeGreaterThanOrEqual(0);
    expect(res.adverseSelectionShare).toBeGreaterThanOrEqual(0);
    expect(res.tradeContinuationProb).toBeGreaterThanOrEqual(0);
    expect(res.tradeContinuationProb).toBeLessThanOrEqual(1);
  });

  it('correctly attributes spread share under stationary midpoints (dominant order processing)', () => {
    const ticks: HuangStollTradeTick[] = [
      { midpoint: 100.0, tradeDirection: 1, price: 100.1 },
      { midpoint: 100.0, tradeDirection: -1, price: 99.9 },
      { midpoint: 100.0, tradeDirection: 1, price: 100.1 },
      { midpoint: 100.0, tradeDirection: -1, price: 99.9 },
      { midpoint: 100.0, tradeDirection: 1, price: 100.1 },
    ];
    const res = computeHuangStollDecomposition(ticks);
    expect(res.orderProcessingShare).toBeCloseTo(1.0, 4);
    expect(res.inventoryHoldingShare).toBeCloseTo(0.0, 4);
    expect(res.adverseSelectionShare).toBeCloseTo(0.0, 4);
  });

  it('supports manual spread override and price-less tick sequences', () => {
    const ticks: HuangStollTradeTick[] = [
      { midpoint: 100.0, tradeDirection: 1 },
      { midpoint: 100.02, tradeDirection: 1 },
      { midpoint: 100.05, tradeDirection: 1 },
      { midpoint: 100.03, tradeDirection: -1 },
    ];
    const res = computeHuangStollDecomposition(ticks, 0.2);
    expect(res.spread).toBe(0.2);
    const sum = res.orderProcessingShare + res.inventoryHoldingShare + res.adverseSelectionShare;
    expect(sum).toBeCloseTo(1.0, 6);
  });
});
