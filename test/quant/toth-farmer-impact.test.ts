import { describe, expect, it } from 'vitest';
import { computeTothFarmerImpact } from '@/tree/quantlib/microstructure/toth-farmer-impact-engine';

describe('Tóth-Chakraborti-Farmer (2011) Universal Square-Root & Power-Law Impact Engine', () => {
  it('computes square-root impact and power-law relaxation trajectory', () => {
    const res = computeTothFarmerImpact({
      orderVolume: 10000,
      dailyVolume: 1000000,
      volatility: 0.02,
      preFactor: 0.7,
      powerLawExponent: 0.5,
      decayTimeConstant: 2.0,
      evaluationSteps: 6,
    });
    expect(res.participationRate).toBe(0.01);
    expect(res.peakImpact).toBeCloseTo(0.7 * 0.02 * 0.1, 5);
    expect(res.instantaneousImpact).toBeLessThan(res.peakImpact);
    expect(res.decayTrajectory.length).toBe(6);
    expect(res.permanentResidualImpact).toBeLessThanOrEqual(res.peakImpact);
    expect(res.decayTrajectory[0].residualImpact).toBe(res.peakImpact);
    expect(res.decayTrajectory[5].residualImpact).toBeLessThan(res.decayTrajectory[0].residualImpact);
  });

  it('demonstrates concave sub-linear impact scaling with order size', () => {
    const small = computeTothFarmerImpact({
      orderVolume: 1000,
      dailyVolume: 1000000,
      volatility: 0.02,
      preFactor: 0.7,
      powerLawExponent: 0.5,
      decayTimeConstant: 1.0,
      evaluationSteps: 4,
    });
    const fourTimes = computeTothFarmerImpact({
      orderVolume: 4000,
      dailyVolume: 1000000,
      volatility: 0.02,
      preFactor: 0.7,
      powerLawExponent: 0.5,
      decayTimeConstant: 1.0,
      evaluationSteps: 4,
    });
    expect(fourTimes.peakImpact / small.peakImpact).toBeCloseTo(2.0, 4);
  });

  it('handles zero order volume cleanly', () => {
    const res = computeTothFarmerImpact({
      orderVolume: 0,
      dailyVolume: 500000,
      volatility: 0.015,
      preFactor: 0.7,
      powerLawExponent: 0.5,
      decayTimeConstant: 1.0,
      evaluationSteps: 4,
    });
    expect(res.participationRate).toBe(0);
    expect(res.peakImpact).toBe(0);
    expect(res.instantaneousImpact).toBe(0);
    expect(res.permanentResidualImpact).toBe(0);
  });
});
