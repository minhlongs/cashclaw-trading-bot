import { describe, expect, it } from 'vitest';
import { validatePairTradable, VALIDATION_REASONS } from './validation';
import type { PairPanel, PairSimConfig } from './types';

// ── Deterministic fixtures (integer LCG — no Math.random / Date.now) ────────

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** AR(phi) residual driven by uniform LCG shocks — bounded, reproducible. */
function arResidual(seed: number, phi: number, shockScale: number, n: number): number[] {
  const next = lcg(seed);
  const e = [1];
  for (let i = 1; i < n; i++) e.push(phi * e[i - 1]! + shockScale * (next() * 2 - 1));
  return e;
}

function timestamps(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 1_700_000_000_000 + i * 60_000);
}

// Cointegrated base pair: B = 2A + 15 + AR(0.25) residual. Theoretical ADF
// t ≈ −sqrt(n·(1−φ)/(1+φ)) ≈ −5.9, safely below the ≈ −4.5 rejection point
// of the approximate p-value, so the REAL testCointegration accepts.
const N = 60;
const TS = timestamps(N);
const CLOSES_A = Array.from({ length: N }, (_, i) => 100 + 0.8 * i + 0.01 * i * i);
const CLOSES_B = CLOSES_A.map((a, i) => 2 * a + 15 + arResidual(7, 0.25, 3, N)[i]!);

/** Independent seeded random walks — no shared stochastic structure. */
function randomWalk(seed: number, start: number, scale: number, n: number): number[] {
  const next = lcg(seed);
  const xs = [start];
  for (let i = 1; i < n; i++) xs.push(xs[i - 1]! + scale * (next() * 2 - 1));
  return xs;
}
const WALK_A = randomWalk(11, 100, 2, N);
const WALK_B = randomWalk(23, 300, 3, N);

/**
 * Alternating-sign residual with LCG jitter: near-periodic sign flips give a
 * strongly negative OLS phi (outside (0,1) → half-life Infinity inside the
 * module) while the ADF fit is near-exact (hugely negative t → cointegrated).
 */
const ALTERNATING_RESIDUAL = arResidual(7, 0.25, 3, N).map((v, i) => (i % 2 === 0 ? -1 : 1) * 20 + v);
const ALTERNATING_B = CLOSES_A.map((a, i) => 2 * a + 15 + ALTERNATING_RESIDUAL[i]!);

/** Explosive divergence: residual grows geometrically → phi-hat far above 1. */
const EXPLOSIVE_B = CLOSES_A.map((a, i) => 2 * a + 15 + 5 * 1.1 ** i);

function panel(a: readonly number[], b: readonly number[], ts: readonly number[] = TS): PairPanel {
  return { legA: 'AAA', legB: 'BBB', timestamps: [...ts], closesA: [...a], closesB: [...b] };
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

const AS_OF = TS[N - 1]!;
const FULL_EXPECTED_SET = (halfLifeReason: string) =>
  new Set([
    VALIDATION_REASONS.notCointegrated,
    halfLifeReason,
    VALIDATION_REASONS.correlationBelowFloor,
    VALIDATION_REASONS.insufficientObservations,
  ]);

describe('validatePairTradable — fail-closed conditions', () => {
  // ── Independent random walks fail (both regression directions) ───────────

  it('rejects random-walk A/B with the cointegration reason', () => {
    const result = validatePairTradable(panel(WALK_A, WALK_B), config(), AS_OF);
    expect(result.tradable).toBe(false);
    expect(result.diagnostics.cointegrated).toBe(false);
    expect(result.diagnostics.pValue).toBeGreaterThanOrEqual(0.05);
    expect(result.reasons).toContain(VALIDATION_REASONS.notCointegrated);
    // Whatever the half-life branch, it never leaks Infinity/NaN raw.
    const hl = result.diagnostics.halfLife;
    if (hl !== null) expect(Number.isFinite(hl)).toBe(true);
  });

  it('rejects the reversed walk direction identically', () => {
    const result = validatePairTradable(panel(WALK_B, WALK_A), config(), AS_OF);
    expect(result.tradable).toBe(false);
    expect(result.diagnostics.cointegrated).toBe(false);
    expect(result.reasons).toContain(VALIDATION_REASONS.notCointegrated);
  });

  // ── Each gate condition fails independently with its distinct reason ─────

  it('fails ONLY on pValue when persistence is high but finite', () => {
    // AR(0.7): ADF t ≈ −3.2 (above the ≈ −4.5 rejection point → not
    // cointegrated) while the estimated phi stays inside (0,1), keeping the
    // half-life finite and short enough to pass its own bound (maxHalfLife
    // relaxed to 500 so ONLY the cointegration condition trips).
    const persistentB = CLOSES_A.map((a, i) => 2 * a + 15 + 4 * arResidual(31, 0.7, 3, N)[i]!);
    const result = validatePairTradable(
      panel(CLOSES_A, persistentB),
      config({ maxHalfLife: 500 }),
      AS_OF,
    );
    expect(result.diagnostics.cointegrated).toBe(false);
    expect(result.diagnostics.halfLife).not.toBeNull();
    expect(result.diagnostics.correlation).toBeGreaterThanOrEqual(0.8);
    expect(result.reasons).toEqual([VALIDATION_REASONS.notCointegrated]);
  });

  it('fails ONLY on the half-life bound when reversion is real but slow', () => {
    // Long window (1999 obs) lets the ADF reject decisively (t ≈ −13) even
    // though phi ≈ 0.85 implies half-life ≈ 4.3 periods — above maxHalfLife=2.
    const nSlow = 2000;
    const tsSlow = timestamps(nSlow);
    const aSlow = Array.from({ length: nSlow }, (_, i) => 100 + 0.05 * i);
    const bSlow = aSlow.map((a, i) => a + 50 + arResidual(41, 0.85, 1, nSlow)[i]!);
    const result = validatePairTradable(
      panel(aSlow, bSlow, tsSlow),
      config({ validationWindow: nSlow, minObservations: nSlow, maxHalfLife: 2 }),
      tsSlow[nSlow - 1]!,
    );
    expect(result.diagnostics.observationCount).toBe(nSlow - 1);
    expect(result.diagnostics.cointegrated).toBe(true);
    expect(result.diagnostics.halfLife).not.toBeNull();
    expect(result.diagnostics.halfLife!).toBeGreaterThan(2);
    expect(result.reasons).toEqual([VALIDATION_REASONS.halfLifeTooLong]);
  });

  it('fails ONLY on the half-life bound being undefined (non-finite → null)', () => {
    // Alternating residual: cointegrated (near-exact ADF fit) yet phi-hat is
    // negative → Infinity inside the module, serialized as null OUTSIDE it.
    const result = validatePairTradable(panel(CLOSES_A, ALTERNATING_B), config(), AS_OF);
    expect(result.diagnostics.cointegrated).toBe(true);
    expect(result.diagnostics.halfLife).toBeNull();
    expect(result.reasons).toEqual([VALIDATION_REASONS.halfLifeNonFinite]);
  });

  it('fails ONLY on the correlation floor when legs are decorrelated', () => {
    // legB is dominated by an independent AR oscillation; its residual vs A
    // stays strongly mean-reverting, so ONLY the correlation gate trips.
    const wobble = arResidual(53, 0.25, 3, N);
    const decorrelatedB = CLOSES_A.map((a, i) => 40 * wobble[i]! + 0.3 * a + 500);
    const result = validatePairTradable(panel(CLOSES_A, decorrelatedB), config(), AS_OF);
    expect(Math.abs(result.diagnostics.correlation)).toBeLessThan(0.8);
    expect(result.diagnostics.cointegrated).toBe(true);
    expect(result.reasons).toEqual([VALIDATION_REASONS.correlationBelowFloor]);
  });

  it('fails ONLY on observation count when history is short', () => {
    // Healthy slice, but minObs raised above the available pre-asOf count —
    // every other condition still passes, isolating the observation gate.
    const result = validatePairTradable(
      panel(CLOSES_A, CLOSES_B),
      config({ minObs: 100 }),
      TS[N - 2]!,
    );
    expect(result.diagnostics.observationCount).toBe(N - 2);
    expect(result.reasons).toEqual([VALIDATION_REASONS.insufficientObservations]);
  });

  it('lists EVERY failed reason together (never stops at the first)', () => {
    // Explosive pair + impossible floors trip all four conditions at once.
    const result = validatePairTradable(
      panel(CLOSES_A, EXPLOSIVE_B),
      config({ minObs: 1000, minCorrelation: 0.99 }),
      AS_OF,
    );
    const hlReason =
      result.diagnostics.halfLife === null
        ? VALIDATION_REASONS.halfLifeNonFinite
        : VALIDATION_REASONS.halfLifeTooLong;
    expect(new Set(result.reasons)).toEqual(FULL_EXPECTED_SET(hlReason));
    expect(result.tradable).toBe(false);
  });
});
