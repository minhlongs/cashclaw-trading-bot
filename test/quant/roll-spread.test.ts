import { describe, it, expect } from 'vitest';
import { computeRollSpread } from '@/tree/quantlib/microstructure/roll-spread-engine';

describe('Roll (1984) Bid-Ask Spread & Autocovariance Microstructure Engine', () => {
  it('extracts positive implicit spread from negative serial autocovariance', () => {
    // Oscillating prices (bid-ask bounce: 100, 101, 100, 101, 100, 101)
    const prices = [100, 101, 100, 101, 100, 101, 100, 101];
    const res = computeRollSpread({ priceSeries: prices, tickSize: 0.01 });

    expect(res.autocovariance).toBeLessThan(0);
    expect(res.isAutocovarianceNegative).toBe(true);
    expect(res.rollSpread).toBeGreaterThan(1.0);
    expect(res.effectiveSpreadPct).toBeGreaterThan(0);
  });

  it('handles trending series with positive autocovariance by setting spread to zero', () => {
    // Monotonically increasing prices
    const prices = [100, 101, 102, 103, 104, 105];
    const res = computeRollSpread({ priceSeries: prices });

    expect(res.isAutocovarianceNegative).toBe(false);
    expect(res.rollSpread).toBe(0);
    expect(res.effectiveSpreadPct).toBe(0);
  });

  it('handles short series (< 3 observations) gracefully', () => {
    const res = computeRollSpread({ priceSeries: [100, 101] });
    expect(res.rollSpread).toBe(0);
    expect(res.numObservations).toBe(2);
  });
});
