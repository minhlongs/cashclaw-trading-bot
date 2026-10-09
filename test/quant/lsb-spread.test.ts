import { describe, it, expect } from 'vitest';
import { computeLsbSpread } from '@/tree/quantlib/microstructure/lsb-spread-engine';

describe('Lin, Sanger & Booth (1995) LSB Spread Decomposition', () => {
  it('decomposes effective spread into adverse selection and order processing', () => {
    // Transaction prices alternating around quote midpoints with persistent revisions
    const transactionPrices = [100.5, 99.5, 101.0, 99.8, 101.5, 100.2, 102.0];
    const quoteMidpoints = [100.0, 100.0, 100.4, 100.4, 100.9, 100.9, 101.2];

    const res = computeLsbSpread({
      transactionPrices,
      quoteMidpoints,
    });

    expect(res.sampleSize).toBe(6);
    expect(res.effectiveSpread).toBeGreaterThan(0);
    expect(res.adverseSelectionRatio).toBeGreaterThanOrEqual(0);
    expect(res.adverseSelectionRatio).toBeLessThanOrEqual(1.0);
    expect(res.orderProcessingRatio).toBeCloseTo(1.0 - res.adverseSelectionRatio, 4);
    expect(res.adverseSelectionSpread + res.orderProcessingSpread).toBeCloseTo(res.effectiveSpread, 4);
  });

  it('infers quote midpoints automatically if omitted', () => {
    const transactionPrices = [100.2, 100.8, 100.4, 101.0, 100.6, 101.2];
    const res = computeLsbSpread({ transactionPrices });
    expect(res.sampleSize).toBe(5);
    expect(res.effectiveSpread).toBeGreaterThan(0);
  });

  it('handles small sample series safely', () => {
    const res = computeLsbSpread({ transactionPrices: [100, 101] });
    expect(res.sampleSize).toBe(0);
    expect(res.effectiveSpread).toBe(0);
  });
});
