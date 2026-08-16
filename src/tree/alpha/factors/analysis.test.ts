import { describe, expect, it } from 'vitest';
import {
  computeFactorExposure,
  multiFactorAnalysis,
  rankFactorsByExposure,
} from './analysis';
import type { Factor } from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate synthetic returns with known relationship to a factor. */
function syntheticReturns(
  factor: number[],
  beta: number,
  alpha = 0.01,
  noise = 0.02,
): number[] {
  // Deterministic pseudo-random noise (seeded sequence).
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  return factor.map((f) => alpha + beta * f + rand() * noise);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('computeFactorExposure', () => {
  it('recovers known beta with high significance', () => {
    const factor = Array.from({ length: 100 }, (_, i) => Math.sin(i / 10));
    const returns = syntheticReturns(factor, 1.5, 0.01, 0.01);
    const result = computeFactorExposure(returns, factor, 'momentum');

    expect(result.factor).toBe('momentum');
    expect(result.exposure).toBeCloseTo(1.5, 1);
    expect(result.significant).toBe(true);
    expect(Math.abs(result.tStat)).toBeGreaterThan(2);
  });

  it('returns zero exposure for empty input', () => {
    const result = computeFactorExposure([], []);
    expect(result.exposure).toBe(0);
    expect(result.significant).toBe(false);
  });

  it('detects insignificant factor with low signal', () => {
    const factor = Array.from({ length: 50 }, () => 0);
    const returns = Array.from({ length: 50 }, () => 0.01);
    const result = computeFactorExposure(returns, factor, 'flat_factor');

    expect(result.exposure).toBe(0);
    expect(result.significant).toBe(false);
  });
});

describe('multiFactorAnalysis', () => {
  it('recovers betas for two known factors', () => {
    const n = 100;
    const f1 = Array.from({ length: n }, (_, i) => Math.cos(i / 8));
    const f2 = Array.from({ length: n }, (_, i) => Math.sin(i / 12));

    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    const returns = f1.map((v, i) => 0.02 + 2.0 * v + 0.5 * f2[i]! + rand() * 0.01);

    const factors: Factor[] = [
      { name: 'value', values: f1, timestamps: f1.map((_, i) => i) },
      { name: 'momentum', values: f2, timestamps: f2.map((_, i) => i) },
    ];
    const result = multiFactorAnalysis(returns, factors);

    expect(result.nObs).toBe(n);
    expect(result.exposures).toHaveLength(2);
    expect(result.exposures[0]!.factor).toBe('value');
    expect(result.exposures[0]!.exposure).toBeCloseTo(2.0, 0);
    expect(result.exposures[1]!.factor).toBe('momentum');
    expect(result.exposures[1]!.exposure).toBeCloseTo(0.5, 0);
    expect(result.rSquared).toBeGreaterThan(0.5);
  });

  it('returns empty exposures when no factors provided', () => {
    const result = multiFactorAnalysis([0.01, 0.02], []);
    expect(result.exposures).toHaveLength(0);
    expect(result.rSquared).toBe(0);
  });
});

describe('rankFactorsByExposure', () => {
  it('ranks stronger factor first', () => {
    const n = 80;
    const strong = Array.from({ length: n }, (_, i) => Math.sin(i / 5));
    const weak = Array.from({ length: n }, (_, i) => Math.cos(i / 3));

    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    const returns = strong.map((v, i) => 3.0 * v + 0.1 * weak[i]! + rand() * 0.01);

    const factors: Factor[] = [
      { name: 'weak_factor', values: weak, timestamps: weak.map((_, i) => i) },
      { name: 'strong_factor', values: strong, timestamps: strong.map((_, i) => i) },
    ];
    const ranked = rankFactorsByExposure(returns, factors);

    expect(ranked[0]!.factor).toBe('strong_factor');
    expect(Math.abs(ranked[0]!.tStat)).toBeGreaterThan(
      Math.abs(ranked[1]!.tStat),
    );
  });
});
