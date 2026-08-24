import { describe, expect, it } from 'vitest';
import {
  estimateRollingHedgeRatio,
  HEDGE_RATIO_REASONS,
  type HedgeRatioResult,
} from './hedge-ratio';
import type { PairPanel } from './types';

/** Assert fail-closed and return the reason (narrows the union for TS). */
function failureReason(result: HedgeRatioResult): string {
  if (result.hedgeRatio !== null) {
    throw new Error(`expected fail-closed result, got β=${result.hedgeRatio}`);
  }
  return result.reason;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const N = 12;
const TS = Array.from({ length: N }, (_, i) => 1_700_000_000_000 + i * 1000);
// Deterministic wiggle lives in legA; legB = 2·legA + 5 is exactly linear,
// so the OLS slope is 2 up to floating-point error.
const CLOSES_A = Array.from({ length: N }, (_, i) => 100 + i + 0.5 * Math.sin(i));
const CLOSES_B = CLOSES_A.map((a) => 2 * a + 5);

function panel(a: readonly number[], b: readonly number[]): PairPanel {
  return { legA: 'A', legB: 'B', timestamps: TS, closesA: a, closesB: b };
}

/** Independent closed-form OLS slope (intercept included) for cross-checks. */
function olsSlope(y: readonly number[], x: readonly number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i]! - mx) * (y[i]! - my);
    den += (x[i]! - mx) ** 2;
  }
  return num / den;
}

// ── Happy path ─────────────────────────────────────────────────────────────

describe('estimateRollingHedgeRatio', () => {
  it('recovers β = 2 within 1e-9 on the hand-computed linear fixture', () => {
    const asOf = TS[N - 1]!;
    const result = estimateRollingHedgeRatio(panel(CLOSES_A, CLOSES_B), 100, 5, asOf);
    expect(result.hedgeRatio).not.toBeNull();
    expect(result.hedgeRatio).toBeCloseTo(2, 9);
    // Cross-check against an independent closed-form OLS on the same slice.
    const expected = olsSlope(CLOSES_B.slice(0, N - 1), CLOSES_A.slice(0, N - 1));
    expect(result.hedgeRatio).toBeCloseTo(expected, 9);
    if (result.hedgeRatio !== null) {
      expect(Number.isFinite(result.tStat)).toBe(true);
    }
  });

  it('respects the trailing window bound', () => {
    const asOf = TS[N - 1]!;
    const full = estimateRollingHedgeRatio(panel(CLOSES_A, CLOSES_B), 100, 3, asOf);
    const windowed = estimateRollingHedgeRatio(panel(CLOSES_A, CLOSES_B), 4, 3, asOf);
    // Both use the last 4 (or all 11) strictly-prior closes of an exactly
    // linear relation → identical β.
    expect(windowed.hedgeRatio).toBeCloseTo(full.hedgeRatio as number, 9);
  });

  // ── Leakage invariance (leakage.test.ts pattern) ─────────────────────────

  it('is invariant to mutations at timestamps >= asOf', () => {
    const asOf = TS[8]!;
    const base = estimateRollingHedgeRatio(panel(CLOSES_A, CLOSES_B), 100, 3, asOf);

    // Violently rewrite every entry at or after asOf in both legs.
    const mutatedA = CLOSES_A.map((v, i) => (i >= 8 ? 1 : v));
    const mutatedB = CLOSES_B.map((v, i) => (i >= 8 ? 9999 : v));
    const after = estimateRollingHedgeRatio(panel(mutatedA, mutatedB), 100, 3, asOf);

    expect(after).toEqual(base);
  });

  it('changes when the asOf boundary shifts by one step', () => {
    // Break linearity at index 7 so the window content matters.
    const brokenB = CLOSES_B.map((v, i) => (i === 7 ? v + 40 : v));
    const p = panel(CLOSES_A, brokenB);
    const at8 = estimateRollingHedgeRatio(p, 100, 3, TS[8]!);
    const at9 = estimateRollingHedgeRatio(p, 100, 3, TS[9]!);
    expect(at8.hedgeRatio).not.toBeNull();
    expect(at9.hedgeRatio).not.toBeNull();
    expect(at9.hedgeRatio).not.toBeCloseTo(at8.hedgeRatio as number, 9);
  });

  // ── Fail-closed degenerate cases ─────────────────────────────────────────

  it('returns null + reason for short history', () => {
    const result = estimateRollingHedgeRatio(panel(CLOSES_A, CLOSES_B), 100, 5, TS[2]!);
    expect(failureReason(result)).toBe(HEDGE_RATIO_REASONS.insufficientObservations);
  });

  it('returns null + reason for flat legA (zero x-variance)', () => {
    const flatA = Array.from({ length: N }, () => 100);
    const result = estimateRollingHedgeRatio(panel(flatA, CLOSES_B), 100, 3, TS[N - 1]!);
    expect(failureReason(result)).toBe(HEDGE_RATIO_REASONS.flatLegA);
  });

  it('returns null + reason for a non-positive β (synthetic negative slope)', () => {
    const invertedB = CLOSES_A.map((a) => -2 * a + 500);
    const result = estimateRollingHedgeRatio(panel(CLOSES_A, invertedB), 100, 3, TS[N - 1]!);
    expect(failureReason(result)).toBe(HEDGE_RATIO_REASONS.nonPositiveBeta);
  });

  it('returns null + reason for |β| < epsilon (flat legB → β = 0)', () => {
    const flatB = Array.from({ length: N }, () => 250);
    const result = estimateRollingHedgeRatio(panel(CLOSES_A, flatB), 100, 3, TS[N - 1]!);
    expect(failureReason(result)).toBe(HEDGE_RATIO_REASONS.degenerateBeta);
  });

  it('never returns NaN — every outcome is null+reason or finite', () => {
    const cases = [TS[0]!, TS[1]!, TS[2]!, TS[N - 1]!];
    for (const asOf of cases) {
      const r = estimateRollingHedgeRatio(panel(CLOSES_A, CLOSES_B), 100, 5, asOf);
      if (r.hedgeRatio === null) {
        expect(typeof r.reason).toBe('string');
      } else {
        expect(Number.isFinite(r.hedgeRatio)).toBe(true);
        expect(Number.isFinite(r.tStat)).toBe(true);
      }
    }
  });

  // ── Input validation + determinism ───────────────────────────────────────

  it('throws on invalid window / minObs / NaN asOf / length mismatch', () => {
    const p = panel(CLOSES_A, CLOSES_B);
    expect(() => estimateRollingHedgeRatio(p, 0, 3, TS[5]!)).toThrow();
    expect(() => estimateRollingHedgeRatio(p, 1.5, 3, TS[5]!)).toThrow();
    expect(() => estimateRollingHedgeRatio(p, 10, 0, TS[5]!)).toThrow();
    expect(() => estimateRollingHedgeRatio(p, 10, 3, Number.NaN)).toThrow();
    const bad: PairPanel = { ...p, closesB: CLOSES_B.slice(0, N - 1) };
    expect(() => estimateRollingHedgeRatio(bad, 10, 3, TS[5]!)).toThrow();
  });

  it('is deterministic — two runs deep-equal', () => {
    const p = panel(CLOSES_A, CLOSES_B);
    const run1 = estimateRollingHedgeRatio(p, 6, 3, TS[10]!);
    const run2 = estimateRollingHedgeRatio(p, 6, 3, TS[10]!);
    expect(run2).toEqual(run1);
  });
});
