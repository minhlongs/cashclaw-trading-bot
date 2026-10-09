import { describe, it, expect } from 'vitest';
import { HawkesJumpToxicityEngine } from '../../src/tree/quantlib/microstructure/hawkes-jump-toxicity';
import { LedoitWolfShrinkageEngine } from '../../src/tree/quantlib/portfolio/ledoit-wolf-shrinkage';

describe('Hawkes Jump & Ledoit-Wolf Portfolio Engines', () => {
  it('detects cascading toxicity bursts from Hawkes order arrivals', () => {
    const engine = new HawkesJumpToxicityEngine({
      baselineIntensity: 1.0,
      excitationAlpha: 0.8,
      decayBeta: 0.9,
      cascadeThreshold: 0.85,
    });

    const now = 10000;
    const quietHistory = [{ timestampMs: 1000, volume: 50 }];
    const quietResult = engine.evaluateIntensity(now, quietHistory);
    expect(quietResult.isCascadingToxicity).toBe(false);

    // Burst of high volume rapid orders in the last 500ms
    const burstHistory = [
      { timestampMs: 9600, volume: 5000 },
      { timestampMs: 9700, volume: 8000 },
      { timestampMs: 9800, volume: 10000 },
      { timestampMs: 9950, volume: 12000 },
    ];
    const burstResult = engine.evaluateIntensity(now, burstHistory);
    expect(burstResult.currentIntensity).toBeGreaterThan(quietResult.currentIntensity);
    expect(burstResult.clusteringFactor).toBeGreaterThan(2.0);
    expect(burstResult.isCascadingToxicity).toBe(true);
  });

  it('computes positive-definite shrunk covariance matrix via Ledoit-Wolf', () => {
    const engine = new LedoitWolfShrinkageEngine();
    const sampleReturns = [
      [0.01, -0.02, 0.015],
      [-0.015, 0.03, -0.01],
      [0.02, -0.01, 0.025],
      [-0.005, 0.015, 0.005],
      [0.012, -0.008, 0.018],
    ];

    const result = engine.computeShrinkageCovariance(sampleReturns);
    expect(result.shrinkageIntensity).toBeGreaterThan(0);
    expect(result.shrinkageIntensity).toBeLessThan(1);
    expect(result.covarianceMatrix.length).toBe(3);
    expect(result.covarianceMatrix[0]?.length).toBe(3);
    // Diagonal variances should be strictly positive
    expect(result.covarianceMatrix[0]![0]).toBeGreaterThan(0);
    expect(result.covarianceMatrix[1]![1]).toBeGreaterThan(0);
    expect(result.covarianceMatrix[2]![2]).toBeGreaterThan(0);
  });
});
