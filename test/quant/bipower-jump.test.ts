import { describe, it, expect } from 'vitest';
import { BipowerJumpEngine } from '@/tree/quantlib/volatility/bipower-jump-engine';

describe('Barndorff-Nielsen & Shephard (2004, 2006) Bipower Variation Jump Detection', () => {
  const diffusiveReturns = [0.01, -0.012, 0.008, -0.005, 0.011, -0.009, 0.006, -0.007, 0.008, -0.006];
  const jumpReturns = [0.001, -0.001, 0.001, -0.002, 0.001, 0.085, -0.001, 0.002, -0.001, 0.001, -0.001, 0.002];

  it('separates realized variance and bipower variation in continuous diffusion', () => {
    const res = BipowerJumpEngine.calculate({ returns: diffusiveReturns });
    expect(res.realizedVariance).toBeGreaterThan(0);
    expect(res.bipowerVariation).toBeGreaterThan(0);
    expect(res.sampleCount).toBe(diffusiveReturns.length);
    expect(res.zScore).toBeDefined();
  });

  it('identifies discrete jump variation when large return shock occurs', () => {
    const res = BipowerJumpEngine.calculate({ returns: jumpReturns, significanceLevel: 0.05 });
    expect(res.jumpVariation).toBeGreaterThan(0);
    expect(res.relativeJumpRatio).toBeGreaterThan(0.5);
    expect(res.hasSignificantJump).toBe(true);
  });

  it('supports instance method estimation', () => {
    const engine = new BipowerJumpEngine();
    const res = engine.estimate(diffusiveReturns);
    expect(res.sampleCount).toBe(diffusiveReturns.length);
  });

  it('throws on insufficient return observations', () => {
    expect(() => BipowerJumpEngine.calculate({ returns: [] })).toThrow();
    expect(() => BipowerJumpEngine.calculate({ returns: [0.01, 0.02] })).toThrow();
  });
});
