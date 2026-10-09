import { describe, it, expect } from 'vitest';
import { computeHuangStollOrderFlow } from '@/tree/quantlib/microstructure/huang-stoll-orderflow-engine';

describe('Huang-Stoll (1994) Order Flow & Trade Spread Decomposition Engine', () => {
  it('decomposes tick-by-tick prices into adverse selection, inventory, and order processing', () => {
    const prices = [100.0, 100.2, 100.1, 100.3, 100.2, 100.4, 100.3];
    const tradeSigns = [1, 1, -1, 1, -1, 1, -1];

    const res = computeHuangStollOrderFlow({ prices, tradeSigns });
    expect(res.sampleSize).toBe(6);
    expect(res.effectiveSpread).toBeGreaterThan(0);
    expect(res.adverseSelectionRatio).toBeGreaterThanOrEqual(0);
    expect(res.inventoryHoldingRatio).toBeGreaterThanOrEqual(0);
    expect(res.orderProcessingRatio).toBeGreaterThanOrEqual(0);
    const sum = res.adverseSelectionRatio + res.inventoryHoldingRatio + res.orderProcessingRatio;
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('handles small or empty price series without throwing', () => {
    const emptyRes = computeHuangStollOrderFlow({ prices: [100, 100.1] });
    expect(emptyRes.sampleSize).toBe(0);
    expect(emptyRes.effectiveSpread).toBe(0);
    expect(emptyRes.orderProcessingRatio).toBe(1);
  });
});
