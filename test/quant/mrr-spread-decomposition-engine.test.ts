import { describe, expect, it } from 'vitest';
import { computeMRRDecomposition } from '@/tree/quantlib/microstructure/mrr-spread-decomposition-engine';
import type { MRRTradeTick } from '@/tree/quantlib/microstructure/mrr-spread-decomposition-types';

describe('Madhavan-Richardson-Roomans (MRR 1997) Spread Decomposition Engine', () => {
  it('handles empty or minimal trade series safely', () => {
    const res = computeMRRDecomposition([]);
    expect(res.spread).toBe(0);
    expect(res.adverseSelectionShare).toBe(0);
    expect(res.orderProcessingShare).toBe(0);
  });

  it('decomposes synthetic buy/sell ticks into adverse selection and order processing shares', () => {
    // Generate alternating order flow with spread jumps
    const ticks: MRRTradeTick[] = [
      { price: 100.0, tradeDirection: 1 },
      { price: 100.1, tradeDirection: 1 },
      { price: 100.05, tradeDirection: -1 },
      { price: 100.15, tradeDirection: 1 },
      { price: 100.08, tradeDirection: -1 },
      { price: 100.02, tradeDirection: -1 },
      { price: 100.12, tradeDirection: 1 },
      { price: 100.06, tradeDirection: -1 },
    ];

    const result = computeMRRDecomposition(ticks);

    expect(result.spread).toBeGreaterThanOrEqual(0);
    expect(result.adverseSelectionShare).toBeGreaterThanOrEqual(0);
    expect(result.adverseSelectionShare).toBeLessThanOrEqual(1);
    expect(result.orderProcessingShare).toBeGreaterThanOrEqual(0);
    expect(result.orderProcessingShare).toBeLessThanOrEqual(1);
    expect(result.adverseSelectionShare + result.orderProcessingShare).toBeCloseTo(1, 4);
    expect(result.orderPersistence).toBeGreaterThanOrEqual(-1);
    expect(result.orderPersistence).toBeLessThanOrEqual(1);
  });
});
