import { describe, it, expect } from 'vitest';
import { computeMrrStructuralSpread } from '@/tree/quantlib/microstructure/mrr-structural-engine';

describe('Madhavan-Richardson-Roomans (1997, MRR) Structural Order Flow Engine', () => {
  it('decomposes bid-ask spread into adverse selection and order processing components', () => {
    const res = computeMrrStructuralSpread({
      tradeSigns: [1, 1, -1, 1, -1],
      adverseSelection: 0.15,
      orderProcessingCost: 0.10,
      autocorrelation: 0.25,
      midPrice: 100,
    });

    expect(res.halfSpread).toBeCloseTo(0.25, 4);
    expect(res.spread).toBeCloseTo(0.50, 4);
    expect(res.adverseSelectionShare).toBeCloseTo(0.15 / 0.25, 4);
    expect(res.orderProcessingShare).toBeCloseTo(0.10 / 0.25, 4);
    expect(res.predictedInnovations).toHaveLength(5);
    // Innovation at t=0 with x0=1: (phi + theta) * 1 = 0.25
    expect(res.predictedInnovations[0]).toBeCloseTo(0.25, 4);
  });

  it('handles reversal and correlated trade flow sequence', () => {
    const res = computeMrrStructuralSpread({
      tradeSigns: [1, -1],
      adverseSelection: 0.20,
      orderProcessingCost: 0.05,
      autocorrelation: 0.5,
    });

    // t=0: dp0 = 0.25
    expect(res.predictedInnovations[0]).toBeCloseTo(0.25, 4);
    // t=1: dp1 = (0.25) * (-1) - (0.05 + 0.5 * 0.20) * (1) = -0.25 - 0.15 = -0.40
    expect(res.predictedInnovations[1]).toBeCloseTo(-0.40, 4);
    expect(res.cumulativePriceChange).toBeCloseTo(0.25 - 0.40, 4);
  });
});
