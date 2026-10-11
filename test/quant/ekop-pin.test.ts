import { describe, it, expect } from 'vitest';
import { computeEkopStructuralPin } from '@/tree/quantlib/microstructure/ekop-structural-pin-engine';

describe('Easley-Kiefer-O\'Hara-Paperman (1996, EKOP) Information Risk & PIN Engine', () => {
  it('computes Probability of Informed Trading and directional order flow asymmetry', () => {
    const res = computeEkopStructuralPin({
      eventProbability: 0.35,
      badNewsProbability: 0.60,
      informedArrivalRate: 500,
      uninformedBuyRate: 400,
      uninformedSellRate: 400,
    });

    // informed = 0.35 * 500 = 175, uninformed = 800 -> PIN = 175 / 975 ~ 0.179
    expect(res.pin).toBeCloseTo(175 / 975, 3);
    expect(res.expectedBuys).toBeCloseTo(0.35 * 0.40 * 500 + 400, 3);
    expect(res.expectedSells).toBeCloseTo(0.35 * 0.60 * 500 + 400, 3);
    expect(res.expectedTotalVolume).toBeCloseTo(975, 3);
    expect(res.orderFlowAsymmetry).toBeGreaterThan(0);
    expect(res.adverseSelectionRiskLevel).toBe('MEDIUM');
  });

  it('classifies HIGH adverse selection risk under elevated informed arrivals', () => {
    const res = computeEkopStructuralPin({
      eventProbability: 0.8,
      badNewsProbability: 0.5,
      informedArrivalRate: 1000,
      uninformedBuyRate: 200,
      uninformedSellRate: 200,
    });

    // informed = 0.8 * 1000 = 800, uninformed = 400 -> PIN = 800 / 1200 = 0.667 > 0.4
    expect(res.pin).toBeCloseTo(0.667, 3);
    expect(res.adverseSelectionRiskLevel).toBe('HIGH');
  });
});
