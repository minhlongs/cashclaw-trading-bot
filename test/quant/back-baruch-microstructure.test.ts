import { describe, expect, it } from 'vitest';
import { computeBackBaruchEquilibrium } from '../../src/tree/quantlib/microstructure/back-baruch-engine';

describe('Back-Baruch (2004) Continuous Information Microstructure Engine', () => {
  it('computes continuous revelation equilibrium with constant lambda and linear variance decay', () => {
    const res = computeBackBaruchEquilibrium({
      timeHorizon: 1.0,
      numSteps: 10,
      priorVariance: 1.0,
      noiseVolatility: 0.5,
      fundamentalValue: 100,
    });

    expect(res.trajectory.length).toBe(10);
    expect(res.averageLambda).toBeGreaterThan(0);
    expect(res.finalDiscoveryEfficiency).toBeCloseTo(1.0, 5);
    expect(res.terminalVariance).toBeCloseTo(0, 5);

    // Verify monotonic decay of posterior variance and monotonic rise of discovery efficiency
    for (let i = 1; i < res.trajectory.length; i++) {
      expect(res.trajectory[i]!.posteriorVariance).toBeLessThanOrEqual(res.trajectory[i - 1]!.posteriorVariance);
      expect(res.trajectory[i]!.priceDiscoveryEfficiency).toBeGreaterThanOrEqual(res.trajectory[i - 1]!.priceDiscoveryEfficiency);
    }
  });

  it('demonstrates constant Kyle lambda across time steps', () => {
    const res = computeBackBaruchEquilibrium({
      timeHorizon: 2.0,
      numSteps: 8,
      priorVariance: 0.64,
      noiseVolatility: 0.4,
    });

    const expectedLambda = Math.sqrt(0.64) / (0.4 * Math.sqrt(2.0));
    expect(res.averageLambda).toBeCloseTo(expectedLambda, 6);
    for (const step of res.trajectory) {
      expect(step.kyleLambda).toBeCloseTo(expectedLambda, 6);
    }
  });

  it('handles small variance parameters gracefully', () => {
    const res = computeBackBaruchEquilibrium({
      timeHorizon: 0.5,
      numSteps: 5,
      priorVariance: 0.0001,
      noiseVolatility: 0.1,
    });

    expect(res.trajectory.length).toBe(5);
    expect(res.averageLambda).toBeGreaterThan(0);
    expect(res.terminalVariance).toBeCloseTo(0, 4);
  });
});
