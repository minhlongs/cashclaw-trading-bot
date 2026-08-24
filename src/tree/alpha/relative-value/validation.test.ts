import { describe, expect, it } from 'vitest';
import { validatePairTradable } from './validation';
import type { PairPanel, PairSimConfig } from './types';

// ── Deterministic fixtures ──────────────────────────────────────────────────
// Integer LCG (Numerical Recipes constants) — no Math.random, no Date.now,
// no transcendental noise: every value is reproducible bit-for-bit.

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const N = 60;
const TS = Array.from({ length: N }, (_, i) => 1_700_000_000_000 + i * 60_000);
// Smooth analytic legA; legB = 2·legA + 15 + AR(0.25) residual — cointegrated
// with a strongly mean-reverting residual (theoretical ADF t ≈ −6 « −4.5).
const CLOSES_A = Array.from({ length: N }, (_, i) => 100 + 0.8 * i + 0.01 * i * i);
const RESIDUAL = (() => {
  const next = lcg(7);
  const e: number[] = [1];
  for (let i = 1; i < N; i++) e.push(0.25 * e[i - 1]! + 3 * (next() * 2 - 1));
  return e;
})();
const CLOSES_B = CLOSES_A.map((a, i) => 2 * a + 15 + RESIDUAL[i]!);

function panel(a: readonly number[], b: readonly number[]): PairPanel {
  return { legA: 'AAA', legB: 'BBB', timestamps: TS, closesA: [...a], closesB: [...b] };
}

function config(overrides: Partial<PairSimConfig> = {}): PairSimConfig {
  return {
    hedgeWindow: 30,
    zWindow: 20,
    minObs: 20,
    entryZ: 2,
    exitZ: 0.5,
    maxHalfLife: 20,
    minCorrelation: 0.8,
    validationWindow: 60,
    revalidateEvery: 10,
    stressMode: 'conservative',
    minObservations: 40,
    ...overrides,
  };
}

// ── Happy path ───────────────────────────────────────────────────────────────

describe('validatePairTradable', () => {
  it('accepts the cointegrated fixture (B = 2A + mean-reverting residual)', () => {
    const result = validatePairTradable(panel(CLOSES_A, CLOSES_B), config(), TS[N - 1]!);
    expect(result.tradable).toBe(true);
    expect(result.reasons).toEqual([]);
    const d = result.diagnostics;
    expect(d.cointegrated).toBe(true);
    expect(d.pValue).toBeLessThan(0.05);
    expect(d.observationCount).toBe(N - 1);
    expect(d.correlation).toBeGreaterThanOrEqual(0.8);
    // Finite positive half-life within the configured bound.
    expect(d.halfLife).not.toBeNull();
    expect(d.halfLife!).toBeGreaterThan(0);
    expect(d.halfLife!).toBeLessThanOrEqual(20);
  });

  // ── Causal contract ────────────────────────────────────────────────────────

  it('is invariant to mutations at timestamps >= asOf', () => {
    const asOfIndex = 40;
    const base = validatePairTradable(panel(CLOSES_A, CLOSES_B), config(), TS[asOfIndex]!);
    // Rewrite every entry at/after asOf violently in both legs.
    const next = lcg(999);
    const mutantA = CLOSES_A.map((v, i) => (i >= asOfIndex ? 8888 + next() * 100 : v));
    const mutantB = CLOSES_B.map((v, i) => (i >= asOfIndex ? 1 + next() * 50 : v));
    const after = validatePairTradable(panel(mutantA, mutantB), config(), TS[asOfIndex]!);
    expect(after).toEqual(base);
    expect(base.tradable).toBe(true);
  });

  it('diagnostics echo the strictly-pre-asOf trailing slice', () => {
    // All 30 entries before TS[30] fit inside validationWindow=60.
    const partial = validatePairTradable(panel(CLOSES_A, CLOSES_B), config(), TS[30]!);
    expect(partial.diagnostics.observationCount).toBe(30);
    // Truncation: validationWindow=10 keeps only the trailing 10 entries.
    const truncated = validatePairTradable(
      panel(CLOSES_A, CLOSES_B),
      config({ validationWindow: 10 }),
      TS[30]!,
    );
    expect(truncated.diagnostics.observationCount).toBe(10);
    // Empty history → everything fails, zero observations reported.
    const empty = validatePairTradable(panel(CLOSES_A, CLOSES_B), config(), TS[0]!);
    expect(empty.tradable).toBe(false);
    expect(empty.diagnostics.observationCount).toBe(0);
  });

  // ── Input validation + determinism ────────────────────────────────────────

  it('throws on malformed panel/config/asOf (fail-closed boundaries)', () => {
    const p = panel(CLOSES_A, CLOSES_B);
    const bad: PairPanel = { ...p, closesB: CLOSES_B.slice(0, N - 1) };
    expect(() => validatePairTradable(bad, config(), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config({ validationWindow: 0 }), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config({ validationWindow: 1.5 }), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config({ minObs: 0 }), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config({ maxHalfLife: 0 }), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config({ maxHalfLife: Number.NaN }), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config({ minCorrelation: 1.1 }), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config({ minCorrelation: -0.1 }), TS[5]!)).toThrow();
    expect(() => validatePairTradable(p, config(), Number.NaN)).toThrow();
  });

  it('is deterministic — two runs deep-equal', () => {
    const p = panel(CLOSES_A, CLOSES_B);
    const run1 = validatePairTradable(p, config(), TS[N - 1]!);
    const run2 = validatePairTradable(p, config(), TS[N - 1]!);
    expect(run2).toEqual(run1);
  });
});
