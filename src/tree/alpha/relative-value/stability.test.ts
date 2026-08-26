import { describe, expect, it } from 'vitest';
import { computePairStability, STABILITY_REASONS } from './stability';
import type { PairPanel, PairSimConfig } from './types';

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;
function ts(n: number): number[] {
  return Array.from({ length: n }, (_, i) => T0 + i * 60_000);
}

function stabilityConfig(overrides: Partial<Parameters<typeof computePairStability>[1]> = {}) {
  return {
    validationWindow: 40,
    minObs: 10,
    maxHalfLife: 50,
    minCorrelation: 0.0,
    subWindows: 4,
    hedgeWindow: 40,
    ...overrides,
  };
}

/** Cointegrated OU-like pair: B = 2A + mean-reverting deviation. */
function ouLikePanel(n: number): PairPanel {
  const dev = Array.from({ length: n }, (_, i) => 8 * Math.sin(i / 2.2));
  const closesA = Array.from({ length: n }, (_, i) => 100 + i * 0.5);
  const closesB = closesA.map((a, i) => 2 * a + dev[i]!);
  return { legA: 'AAA', legB: 'BBB', timestamps: ts(n), closesA, closesB };
}

/** Diverging pair: B decouples from A halfway through (unstable). */
function divergingPanel(n: number): PairPanel {
  const closesA = Array.from({ length: n }, (_, i) => 100 + i);
  const closesB = closesA.map((a, i) => (i < n / 2 ? 2 * a : a + 5 * i));
  return { legA: 'AAA', legB: 'BBB', timestamps: ts(n), closesA, closesB };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('computePairStability', () => {
  it('returns score in [0,1] with all components exposed for a stable pair', () => {
    const panel = ouLikePanel(120);
    const result = computePairStability(panel, stabilityConfig(), T0 + 120 * 60_000);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.reason).toBeUndefined();
    expect(result.components).not.toBeNull();
    const c = result.components!;
    expect(c.gatePassFraction).toBeGreaterThanOrEqual(0);
    expect(c.gatePassFraction).toBeLessThanOrEqual(1);
    expect(c.betaDriftPenalty).toBeGreaterThanOrEqual(0);
    expect(c.betaDriftPenalty).toBeLessThanOrEqual(1);
    expect(c.crossingConsistency).toBeGreaterThanOrEqual(0);
    expect(c.crossingConsistency).toBeLessThanOrEqual(1);
  });

  it('scores a stable OU-like pair strictly above a diverging pair', () => {
    const stable = computePairStability(ouLikePanel(120), stabilityConfig(), T0 + 121 * 60_000);
    const diverging = computePairStability(divergingPanel(120), stabilityConfig(), T0 + 121 * 60_000);
    expect(stable.score).toBeGreaterThan(diverging.score);
  });

  it('is deterministic — two runs deep-equal', () => {
    const panel = ouLikePanel(80);
    const r1 = computePairStability(panel, stabilityConfig(), T0 + 81 * 60_000);
    const r2 = computePairStability(panel, stabilityConfig(), T0 + 81 * 60_000);
    expect(r2).toEqual(r1);
  });

  it('fails closed on a too-short pre-asOf slice with the exact reason', () => {
    const panel = ouLikePanel(6);
    const result = computePairStability(
      panel,
      stabilityConfig({ subWindows: 4 }),
      T0 + 7 * 60_000,
    );
    expect(result.score).toBe(0);
    expect(result.components).toBeNull();
    expect(result.reason).toBe(STABILITY_REASONS.insufficientObservations);
  });

  it('throws when subWindows < 2 or NaN asOf (input validation)', () => {
    const panel = ouLikePanel(20);
    expect(() =>
      computePairStability(panel, stabilityConfig({ subWindows: 1 }), T0),
    ).toThrow(/subWindows/);
    expect(() =>
      computePairStability(panel, stabilityConfig(), Number.NaN),
    ).toThrow(/NaN/);
  });

  it('leakage invariance — mutating rows at/after windowEndAsOf leaves score identical', () => {
    const k = 60;
    const panel = ouLikePanel(120);
    const boundary = panel.timestamps[k]!; // rows >= k are "future"
    const base = computePairStability(panel, stabilityConfig(), boundary);
    const mutated: PairPanel = {
      ...panel,
      closesA: panel.closesA.map((v, i) => (i >= k ? 1 : v)),
      closesB: panel.closesB.map((v, i) => (i >= k ? 9999 : v)),
    };
    const after = computePairStability(mutated, stabilityConfig(), boundary);
    expect(after).toEqual(base);
  });

  it('uses existing gate config fields — minCorrelation floor is respected', () => {
    const panel = ouLikePanel(120);
    // A zero-correlation floor cannot lower the fraction below a strict floor.
    const loose = computePairStability(
      panel,
      stabilityConfig({ minCorrelation: 0 }),
      T0 + 121 * 60_000,
    );
    const strict = computePairStability(
      panel,
      stabilityConfig({ minCorrelation: 0.999999 }),
      T0 + 121 * 60_000,
    );
    expect(strict.components!.gatePassFraction)
      .toBeLessThanOrEqual(loose.components!.gatePassFraction);
  });

  it('accepts a full PairSimConfig (structurally assignable to PairStabilityConfig)', () => {
    const panel = ouLikePanel(80);
    const simConfig: PairSimConfig = {
      hedgeWindow: 30,
      zWindow: 5,
      minObs: 10,
      entryZ: 2,
      exitZ: 0.5,
      maxHalfLife: 50,
      minCorrelation: 0,
      validationWindow: 30,
      revalidateEvery: 10,
      minObservations: 10,
    };
    const extended = { ...simConfig, subWindows: 3 };
    const result = computePairStability(panel, extended, T0 + 81 * 60_000);
    expect(result.components).not.toBeNull();
  });
});
