import { describe, expect, it } from 'vitest';
import { computeEasleyOharaAsymmetry } from '@/tree/quantlib/microstructure/easley-ohara-engine';

describe('Easley-O\'Hara (1987) Trade-Size Information Asymmetry Engine', () => {
  it('computes higher PIN and spread for large trades when informed traders prefer size', () => {
    const res = computeEasleyOharaAsymmetry({
      eventProbability: 0.3,
      informedLargeFraction: 0.8,
      uninformedSmallRate: 50,
      uninformedLargeRate: 10,
      informedRate: 40,
      baseAssetPrice: 100,
      volatility: 0.02,
    });

    expect(res.pinLarge).toBeGreaterThan(res.pinSmall);
    expect(res.spreadLargeBps).toBeGreaterThan(res.spreadSmallBps);
    expect(res.sizeAsymmetryRatio).toBeGreaterThan(1.0);
    expect(res.largeOrderAdverseSelectionMarkup).toBeGreaterThan(0);
  });

  it('demonstrates symmetric PIN when informed traders distribute orders equally', () => {
    const res = computeEasleyOharaAsymmetry({
      eventProbability: 0.4,
      informedLargeFraction: 0.5,
      uninformedSmallRate: 20,
      uninformedLargeRate: 20,
      informedRate: 30,
      baseAssetPrice: 150,
      volatility: 0.015,
    });

    expect(res.pinLarge).toBeCloseTo(res.pinSmall, 5);
    expect(res.sizeAsymmetryRatio).toBeCloseTo(1.0, 5);
    expect(res.largeOrderAdverseSelectionMarkup).toBeCloseTo(0, 5);
  });

  it('handles zero informed arrival rate cleanly', () => {
    const res = computeEasleyOharaAsymmetry({
      eventProbability: 0.5,
      informedLargeFraction: 0.7,
      uninformedSmallRate: 40,
      uninformedLargeRate: 15,
      informedRate: 0,
      baseAssetPrice: 100,
      volatility: 0.02,
    });

    expect(res.pinLarge).toBe(0);
    expect(res.pinSmall).toBe(0);
    expect(res.spreadLargeBps).toBe(0);
    expect(res.spreadSmallBps).toBe(0);
  });
});
