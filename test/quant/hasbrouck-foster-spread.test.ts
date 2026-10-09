import { describe, it, expect } from 'vitest';
import { computeHasbrouckFosterSpread } from '@/tree/quantlib/microstructure/hasbrouck-foster-spread-engine';

describe('Hasbrouck & Foster (1995) Order Flow Asymmetry & Spread', () => {
  it('measures asymmetric adverse selection and effective spread', () => {
    const transactionPrices = [100.5, 99.5, 101.0, 99.8, 101.5, 100.2, 102.0];
    const quoteMidpoints = [100.0, 100.0, 100.4, 100.4, 100.9, 100.9, 101.2];
    const signedTradeVolumes = [500, -300, 600, -200, 700, -100];

    const res = computeHasbrouckFosterSpread({
      transactionPrices,
      quoteMidpoints,
      signedTradeVolumes,
    });

    expect(res.sampleSize).toBe(6);
    expect(res.effectiveSpread).toBeGreaterThan(0);
    expect(res.buyImpact).toBeGreaterThanOrEqual(0);
    expect(res.sellImpact).toBeGreaterThanOrEqual(0);
    expect(res.asymmetryIndex).toBeGreaterThanOrEqual(0);
    expect(res.asymmetryIndex).toBeLessThanOrEqual(1.0);
  });

  it('infers quote midpoints and trade signs automatically if omitted', () => {
    const transactionPrices = [100.2, 100.8, 100.4, 101.0, 100.6, 101.2];
    const res = computeHasbrouckFosterSpread({ transactionPrices });
    expect(res.sampleSize).toBe(5);
    expect(res.effectiveSpread).toBeGreaterThan(0);
  });

  it('handles small sample series safely', () => {
    const res = computeHasbrouckFosterSpread({ transactionPrices: [100, 101] });
    expect(res.sampleSize).toBe(0);
    expect(res.effectiveSpread).toBe(0);
  });
});
