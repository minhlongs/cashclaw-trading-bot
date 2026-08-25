import { describe, expect, it } from 'vitest';
import {
  estimateRollingBetas,
  scaleWeightsToTargetBeta,
} from './beta-sizing';
import { inverseBetaTilt } from './beta-tilt';
import type { AssetReturnSeries } from './types';

// ── Fixtures ───────────────────────────────────────────────────────────────

const TS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// Non-degenerate benchmark: repeating [-1%, 0, +1%] pattern (mean 0).
const BENCH = TS.map((i) => 0.01 * ((i % 3) - 1));

function series(symbol: string, returns: readonly number[]): AssetReturnSeries {
  return { symbol, timestamps: TS, returns };
}
const benchmark = series('BENCH', BENCH);
const aaa = series('AAA', BENCH.map((b) => 2 * b)); // true beta 2
const bbb = series('BBB', BENCH.map((b) => 0.5 * b)); // true beta 0.5
const ccc = series('CCC', BENCH.map((b) => -b)); // true beta -1

function realizedBeta(
  weights: Readonly<Record<string, number>>,
  betas: Readonly<Record<string, number | null>>,
): number {
  return Object.entries(weights).reduce((s, [sym, w]) => s + w * (betas[sym] ?? 0), 0);
}

// ── estimateRollingBetas ───────────────────────────────────────────────────

describe('estimateRollingBetas', () => {
  it('recovers exact OLS betas on clean linear fixtures', () => {
    const betas = estimateRollingBetas([aaa, bbb, ccc], benchmark, 100, 5);
    expect(betas.AAA).toBeCloseTo(2, 10);
    expect(betas.BBB).toBeCloseTo(0.5, 10);
    expect(betas.CCC).toBeCloseTo(-1, 10);
  });

  it('uses only returns with timestamp < sizingTime (look-ahead invariance)', () => {
    const sizingTime = 5;
    const before = estimateRollingBetas([aaa], benchmark, 100, 3, sizingTime);
    expect(before.AAA).toBeCloseTo(2, 10);

    // Append violent future moves AFTER sizingTime to both series.
    const futureTs = [5, 6, 7, 8, 9, 10, 11, 12];
    const futureBench = futureTs.map(() => 0.5);
    const futureAsset = futureTs.map(() => -3.7);
    const benchExtended: AssetReturnSeries = {
      symbol: 'BENCH',
      timestamps: [...TS.slice(0, 5), ...futureTs],
      returns: [...BENCH.slice(0, 5), ...futureBench],
    };
    const aaaExtended: AssetReturnSeries = {
      symbol: 'AAA',
      timestamps: [...TS.slice(0, 5), ...futureTs],
      returns: [...BENCH.slice(0, 5).map((b) => 2 * b), ...futureAsset],
    };

    const after = estimateRollingBetas([aaaExtended], benchExtended, 100, 3, sizingTime);
    expect(after.AAA).toBe(before.AAA);

    // Sanity: without the sizing-time gate the same data yields a different beta.
    const unguarded = estimateRollingBetas([aaaExtended], benchExtended, 100, 3);
    expect(unguarded.AAA).not.toBeCloseTo(2, 2);
  });

  it('window keeps only the trailing N aligned observations', () => {
    // First 5 obs beta 1, last 5 obs beta 3; window 5 must see only beta 3.
    const returns = BENCH.map((b, i) => (i < 5 ? b : 3 * b));
    const betas = estimateRollingBetas([series('AAA', returns)], benchmark, 5, 3);
    expect(betas.AAA).toBeCloseTo(3, 10);
  });

  it('returns null when fewer than minObs aligned observations', () => {
    const betas = estimateRollingBetas([aaa], benchmark, 100, 20);
    expect(betas.AAA).toBeNull();
  });

  it('returns null when benchmark variance is zero', () => {
    const flat = series('FLAT', TS.map(() => 0));
    const betas = estimateRollingBetas([aaa], flat, 100, 3);
    expect(betas.AAA).toBeNull();
  });

  it('skips timestamps missing from the benchmark', () => {
    // Benchmark only covers even timestamps; odd asset observations are dropped.
    const sparseBench: AssetReturnSeries = {
      symbol: 'BENCH',
      timestamps: [0, 2, 4, 6, 8],
      returns: [0, 2, 4, 6, 8].map((i) => BENCH[i]!),
    };
    const betas = estimateRollingBetas([aaa], sparseBench, 100, 3);
    expect(betas.AAA).toBeCloseTo(2, 10);
  });

  it('rejects invalid window/minObs and misaligned series', () => {
    expect(() => estimateRollingBetas([aaa], benchmark, 0, 3)).toThrow(/window/);
    expect(() => estimateRollingBetas([aaa], benchmark, 5, 0)).toThrow(/minObs/);
    const bad: AssetReturnSeries = { symbol: 'X', timestamps: [0, 1], returns: [0] };
    expect(() => estimateRollingBetas([bad], benchmark, 5, 3)).toThrow(/mismatch/);
  });
});

// ── scaleWeightsToTargetBeta ───────────────────────────────────────────────

describe('scaleWeightsToTargetBeta', () => {
  const betas: Record<string, number | null> = { AAA: 2, BBB: 0.5, CCC: -1 };
  // βp = 0.25·2 + 1·0.5 = 1.0 exactly.
  const weights = { AAA: 0.25, BBB: 1 };

  it('targetBeta 0.5 with known βp=1.0 halves all weights; realized beta ≈ 0.5', () => {
    const result = scaleWeightsToTargetBeta(weights, betas, 0.5);
    expect(result.betaApplied).toBe(true);
    expect(result.fallbackReason).toBeUndefined();
    expect(result.weights.AAA).toBeCloseTo(0.125, 12);
    expect(result.weights.BBB).toBeCloseTo(0.5, 12);
    expect(realizedBeta(result.weights, betas)).toBeCloseTo(0.5, 12);
  });

  it('targetBeta 0 neutralizes: weights sum to ≈ 0 within 1e-9', () => {
    const result = scaleWeightsToTargetBeta({ AAA: 0.6, BBB: 0.4 }, betas, 0);
    expect(result.betaApplied).toBe('neutralized');
    const sum = Object.values(result.weights).reduce((s, w) => s + w, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-9);
  });

  it('fail-closed on null beta: weights unchanged, betaApplied false', () => {
    const withNull: Record<string, number | null> = { AAA: 2, BBB: null };
    const input = { AAA: 0.5, BBB: 0.5 };
    const result = scaleWeightsToTargetBeta(input, withNull, 0.5);
    expect(result.betaApplied).toBe(false);
    expect(result.weights).toEqual(input);
    expect(result.weights).not.toBe(input); // defensive copy
    expect(result.fallbackReason).toMatch(/BBB/);
  });

  it('fail-closed when a held asset is missing from the beta map', () => {
    const result = scaleWeightsToTargetBeta({ AAA: 0.5, ZZZ: 0.5 }, { AAA: 2 }, 0.5);
    expect(result.betaApplied).toBe(false);
    expect(result.weights).toEqual({ AAA: 0.5, ZZZ: 0.5 });
    expect(result.fallbackReason).toMatch(/ZZZ/);
  });

  it('fail-closed when portfolio beta is within epsilon of zero', () => {
    // βp = 0.5·2 + 1·(-1) = 0 exactly.
    const input = { AAA: 0.5, CCC: 1 };
    const result = scaleWeightsToTargetBeta(input, betas, 0.5);
    expect(result.betaApplied).toBe(false);
    expect(result.weights).toEqual(input);
    expect(result.fallbackReason).toMatch(/epsilon/);
  });

  it('fail-closed on empty book', () => {
    const result = scaleWeightsToTargetBeta({}, betas, 0.5);
    expect(result.betaApplied).toBe(false);
    expect(result.weights).toEqual({});
    expect(result.fallbackReason).toBeDefined();
  });

  it('renormalize=true preserves gross exposure (beta target traded off)', () => {
    const result = scaleWeightsToTargetBeta(weights, betas, 0.5, { renormalize: true });
    expect(result.betaApplied).toBe(true);
    const grossIn = Object.values(weights).reduce((s, w) => s + Math.abs(w), 0);
    const grossOut = Object.values(result.weights).reduce((s, w) => s + Math.abs(w), 0);
    expect(grossOut).toBeCloseTo(grossIn, 12);
  });

  it('rejects NaN targetBeta and never mutates the input', () => {
    expect(() => scaleWeightsToTargetBeta(weights, betas, Number.NaN)).toThrow(/NaN/);
    const frozen = { ...weights };
    scaleWeightsToTargetBeta(weights, betas, 0.5);
    expect(weights).toEqual(frozen);
  });
});

// ── inverseBetaTilt ────────────────────────────────────────────────────────

describe('inverseBetaTilt', () => {
  it('tilts toward low-beta assets, preserves signs and gross exposure', () => {
    const betas: Record<string, number | null> = { AAA: 2, BBB: 0.5 };
    const result = inverseBetaTilt({ AAA: 0.5, BBB: 0.5 }, betas);
    expect(result.applied).toBe(true);
    // inv: AAA 0.5, BBB 2 → shares 0.2 / 0.8 of gross 1.
    expect(result.weights.AAA).toBeCloseTo(0.2, 12);
    expect(result.weights.BBB).toBeCloseTo(0.8, 12);

    const signed = inverseBetaTilt({ AAA: 0.5, BBB: -0.5 }, betas);
    expect(signed.weights.AAA).toBeCloseTo(0.2, 12);
    expect(signed.weights.BBB).toBeCloseTo(-0.8, 12);
  });

  it('fail-closed on null or zero beta, and on empty book', () => {
    const input = { AAA: 0.5, BBB: 0.5 };
    const withNull = inverseBetaTilt(input, { AAA: 2, BBB: null });
    expect(withNull.applied).toBe(false);
    expect(withNull.weights).toEqual(input);
    expect(withNull.fallbackReason).toMatch(/BBB/);

    const withZero = inverseBetaTilt(input, { AAA: 2, BBB: 0 });
    expect(withZero.applied).toBe(false);
    expect(withZero.weights).toEqual(input);

    const empty = inverseBetaTilt({}, { AAA: 2 });
    expect(empty.applied).toBe(false);
    expect(empty.fallbackReason).toBeDefined();
  });
});
