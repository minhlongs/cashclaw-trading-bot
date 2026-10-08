import { describe, it, expect } from 'vitest';
import {
  calculateClaytonLowerTailDependence,
  estimatePortfolioTailRiskMultiplier,
} from './copula-tail-dependence';

describe('copula-tail-dependence', () => {
  it('returns 0 lower tail dependence for non-positive theta', () => {
    expect(calculateClaytonLowerTailDependence(0)).toBe(0);
    expect(calculateClaytonLowerTailDependence(-1)).toBe(0);
  });

  it('correctly calculates Clayton lower tail dependence for positive theta', () => {
    // For theta = 1, lambda_L = 2^(-1/1) = 0.5
    expect(calculateClaytonLowerTailDependence(1)).toBe(0.5);
    // For theta = 2, lambda_L = 2^(-1/2) = 1/sqrt(2) approx 0.707107
    expect(calculateClaytonLowerTailDependence(2)).toBeCloseTo(0.707107, 5);
  });

  it('estimates tail risk multiplier combining tail dependence and correlations', () => {
    const res = estimatePortfolioTailRiskMultiplier({ claytonTheta: 1 }, [0.6, 0.8]);
    expect(res.lowerTailDependence).toBe(0.5);
    // avgCorr = 0.7; multiplier = 1 + 0.5 * (1 + 0.7) = 1 + 0.85 = 1.85
    expect(res.tailRiskMultiplier).toBe(1.85);
  });
});
