import { describe, it, expect } from 'vitest';
import { BipowerVariationEngine } from '../../src/tree/quantlib/volatility/bipower-variation-engine';

describe('BipowerVariationEngine', () => {
  it('returns zero metrics when sample size is below minObservations', () => {
    const engine = new BipowerVariationEngine({ minObservations: 10 });
    const result = engine.detectJumps([0.01, -0.01, 0.02]);
    expect(result.sampleCount).toBe(3);
    expect(result.realizedVariance).toBe(0);
    expect(result.hasSignificantJump).toBe(false);
  });

  it('detects low jump variation in clean diffusive Gaussian-like returns', () => {
    const engine = new BipowerVariationEngine({
      minObservations: 10,
      zCriticalThreshold: 1.96,
    });
    // Moderate, steady returns without discrete jumps
    const diffusiveReturns = [
      0.002, -0.002, 0.003, -0.001, 0.002,
      -0.002, 0.001, -0.003, 0.002, -0.001,
      0.002, -0.002, 0.001, -0.001, 0.002,
    ];
    const result = engine.detectJumps(diffusiveReturns);

    expect(result.sampleCount).toBe(15);
    expect(result.realizedVariance).toBeGreaterThan(0);
    expect(result.bipowerVariation).toBeGreaterThan(0);
    expect(result.hasSignificantJump).toBe(false);
  });

  it('triggers jump alarm on sharp discrete price discontinuity', () => {
    const engine = new BipowerVariationEngine({
      minObservations: 10,
      zCriticalThreshold: 1.645,
    });
    // 14 small ticks + 1 massive 8% shock
    const jumpReturns = [
      0.0005, -0.0004, 0.0006, -0.0005, 0.0004,
      -0.0003, 0.0005, -0.0004, 0.08, -0.0005,
      0.0004, -0.0003, 0.0005, -0.0004, 0.0003,
    ];
    const result = engine.detectJumps(jumpReturns);

    expect(result.realizedVariance).toBeGreaterThan(result.bipowerVariation);
    expect(result.jumpVariation).toBeGreaterThan(0);
    expect(result.relativeJumpRatio).toBeGreaterThan(0.5);
    expect(result.jumpZScore).toBeGreaterThan(1.645);
    expect(result.hasSignificantJump).toBe(true);
  });
});
