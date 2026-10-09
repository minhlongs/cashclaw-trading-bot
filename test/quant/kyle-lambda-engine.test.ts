import { describe, it, expect } from 'vitest';
import { KyleLambdaEngine } from '../../src/tree/quantlib/microstructure/kyle-lambda-engine';

describe('KyleLambdaEngine Microstructure Adverse Selection', () => {
  it('returns default zeroes when observations are fewer than minObservations', () => {
    const engine = new KyleLambdaEngine({ minObservations: 5 });
    const result = engine.estimateLambda([
      { orderFlow: 10, priceChange: 0.5 },
      { orderFlow: -10, priceChange: -0.5 },
    ]);
    expect(result.lambda).toBe(0);
    expect(result.rSquared).toBe(0);
    expect(result.isInformedFlowDominant).toBe(false);
    expect(result.sampleCount).toBe(2);
  });

  it('correctly calculates positive adverse selection lambda for informed order flow', () => {
    const engine = new KyleLambdaEngine({
      minObservations: 4,
      adverseSelectionThreshold: 0.04,
    });
    // Order flow directly drives price change with slope = 0.05
    const observations = [
      { orderFlow: 100, priceChange: 5.0 },
      { orderFlow: -100, priceChange: -5.0 },
      { orderFlow: 50, priceChange: 2.5 },
      { orderFlow: -50, priceChange: -2.5 },
    ];
    const result = engine.estimateLambda(observations);
    expect(result.lambda).toBeCloseTo(0.05, 4);
    expect(result.rSquared).toBeGreaterThan(0.95);
    expect(result.isInformedFlowDominant).toBe(true);
    expect(result.sampleCount).toBe(4);
  });

  it('identifies uninformative noise trading when covariance is negligible', () => {
    const engine = new KyleLambdaEngine({ minObservations: 4 });
    const noiseObs = [
      { orderFlow: 100, priceChange: -0.1 },
      { orderFlow: -100, priceChange: 0.1 },
      { orderFlow: 50, priceChange: 0.2 },
      { orderFlow: -50, priceChange: -0.2 },
    ];
    const result = engine.estimateLambda(noiseObs);
    expect(result.isInformedFlowDominant).toBe(false);
  });
});
