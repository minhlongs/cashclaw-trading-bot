import { describe, it, expect } from 'vitest';
import { computeHasbrouckVecm } from '@/tree/quantlib/microstructure/hasbrouck-vecm-engine';

describe('Hasbrouck-Collins-Dufresne (1995) VECM Order Flow Toxicity Engine', () => {
  it('computes permanent impact, toxicity score, and information share', () => {
    const ticks = [
      { midPrice: 100.0, orderFlow: 0, spread: 0.05 },
      { midPrice: 100.1, orderFlow: 10, spread: 0.05 },
      { midPrice: 100.25, orderFlow: 15, spread: 0.06 },
      { midPrice: 100.2, orderFlow: -5, spread: 0.05 },
      { midPrice: 100.4, orderFlow: 20, spread: 0.06 },
    ];

    const res = computeHasbrouckVecm({ ticks });
    expect(res.permanentPriceImpact).toBeGreaterThan(0);
    expect(res.toxicityScore).toBeGreaterThanOrEqual(0);
    expect(res.toxicityScore).toBeLessThanOrEqual(1);
    expect(res.informationShare).toBeGreaterThanOrEqual(0);
    expect(res.informationShare).toBeLessThanOrEqual(1);
    expect(res.errorCorrectionSpeed).toBeGreaterThan(0);
  });

  it('handles degenerate / single tick case safely', () => {
    const res = computeHasbrouckVecm({
      ticks: [{ midPrice: 50.0, orderFlow: 5 }],
    });

    expect(res.permanentPriceImpact).toBe(0);
    expect(res.toxicityScore).toBe(0);
    expect(res.informationShare).toBe(0);
  });

  it('computes metrics with custom cointegration beta and lag parameters', () => {
    const ticks = [
      { midPrice: 10.0, orderFlow: 0 },
      { midPrice: 10.5, orderFlow: 5 },
      { midPrice: 11.0, orderFlow: 5 },
    ];

    const res = computeHasbrouckVecm({
      ticks,
      cointegrationBeta: 0.8,
      lagCoeff: 0.1,
    });

    expect(res.errorCorrectionSpeed).toBeCloseTo(0.8 * 0.9, 2);
    expect(res.permanentPriceImpact).toBeGreaterThan(0);
  });
});
