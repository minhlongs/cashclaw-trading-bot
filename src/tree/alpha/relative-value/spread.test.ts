import { describe, expect, it } from 'vitest';
import { estimateRollingHedgeRatio } from './hedge-ratio';
import { buildSpreadSeries, SPREAD_REASONS } from './spread';
import type { PairPanel, PairSimConfig } from './types';

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<PairSimConfig> = {}): PairSimConfig {
  return {
    hedgeWindow: 100,
    zWindow: 2,
    minObs: 3,
    entryZ: 2,
    exitZ: 0.5,
    maxHalfLife: 50,
    minCorrelation: 0.5,
    validationWindow: 30,
    revalidateEvery: 10,
    minObservations: 6,
    ...overrides,
  };
}

const T0 = 1_700_000_000_000;
function ts(n: number): number[] {
  return Array.from({ length: n }, (_, i) => T0 + i * 1000);
}

/**
 * Hand-computed fixture (arithmetic verified by closed form).
 * A = [10,11,12,13,14,15]; B = 2A + 5 except w(2)=+1 → B(2)=30.
 * β(t_k) = OLS of B on A over indices STRICTLY < k (minObs 3):
 *   β(t3) = 5/2 = 2.5, β(t4) = 10.5/5 = 2.1, β(t5) = 20/10 = 2.0.
 * Spreads s(j) = B(j) − β(t_{j+1})·A(j):
 *   s(2) = 30 − 2.5·12 = 0, s(3) = 31 − 2.1·13 = 3.7, s(4) = 33 − 2·14 = 5.
 * zWindow = 2 → z(t4) = (3.7 − 1.85)/1.85 = 1, z(t5) = (5 − 4.35)/0.65 = 1.
 */
const HAND_A = [10, 11, 12, 13, 14, 15];
const HAND_B = [25, 27, 30, 31, 33, 35];
const HAND_PANEL: PairPanel = {
  legA: 'A',
  legB: 'B',
  timestamps: ts(6),
  closesA: HAND_A,
  closesB: HAND_B,
};

// Exactly linear panel (wiggle lives in legA): β̂ = 2 exactly, spread = 5.
const N = 12;
const LIN_A = Array.from({ length: N }, (_, i) => 100 + i + 0.5 * Math.sin(i));
const LIN_B = LIN_A.map((a) => 2 * a + 5);
const LIN_PANEL: PairPanel = { legA: 'A', legB: 'B', timestamps: ts(N), closesA: LIN_A, closesB: LIN_B };

// ── Hand-computed series ───────────────────────────────────────────────────

describe('buildSpreadSeries', () => {
  it('matches hand arithmetic for β, spread and z exactly (within 1e-9)', () => {
    const series = buildSpreadSeries(HAND_PANEL, makeConfig());
    expect(series).toHaveLength(6);

    // t0: no strictly-prior data at all → fully degenerate.
    expect(series[0]).toMatchObject({
      hedgeRatio: null,
      spread: null,
      zScore: null,
      reason: `${SPREAD_REASONS.hedgeRatioUnavailable}: no strictly-prior data at first timestamp`,
    });
    // t1: only 1 strictly-prior observation (< 3) → β unavailable.
    expect(series[1]).toMatchObject({
      hedgeRatio: null,
      spread: null,
      zScore: null,
      reason: `${SPREAD_REASONS.hedgeRatioUnavailable}: insufficient observations`,
    });
    // t2: only 2 strictly-prior observations (< 3) → β unavailable.
    expect(series[2]).toMatchObject({
      hedgeRatio: null,
      spread: null,
      zScore: null,
      reason: `${SPREAD_REASONS.hedgeRatioUnavailable}: insufficient observations`,
    });
    // t3: β = 2.5, spread = s(2) = 0; window [null, 0] → z unavailable.
    expect(series[3]!.hedgeRatio).toBeCloseTo(2.5, 9);
    expect(series[3]!.spread).toBeCloseTo(0, 9);
    expect(series[3]!.zScore).toBeNull();
    expect(series[3]!.reason).toBe(SPREAD_REASONS.spreadUnavailable);
    // t4: β = 2.1, spread = s(3) = 3.7, z = 1.
    expect(series[4]!.hedgeRatio).toBeCloseTo(2.1, 9);
    expect(series[4]!.spread).toBeCloseTo(3.7, 9);
    expect(series[4]!.zScore).toBeCloseTo(1, 9);
    // t5: β = 2.0, spread = s(4) = 5, z = 1.
    expect(series[5]!.hedgeRatio).toBeCloseTo(2.0, 9);
    expect(series[5]!.spread).toBeCloseTo(5, 9);
    expect(series[5]!.zScore).toBeCloseTo(1, 9);
  });

  it('exactly-linear fixture recovers β̂ = 2 within 1e-9 with spread = 5', () => {
    const series = buildSpreadSeries(LIN_PANEL, makeConfig());
    for (let k = 3; k < N; k++) {
      expect(series[k]!.hedgeRatio).toBeCloseTo(2, 9);
    }
    // s(2) needs β(t3), which fails on 2 observations → spreads start at k=4.
    for (let k = 4; k < N; k++) {
      expect(series[k]!.spread).toBeCloseTo(5, 9);
    }
  });

  it('β(t) values match direct estimator calls at each boundary', () => {
    const config = makeConfig();
    const series = buildSpreadSeries(HAND_PANEL, config);
    for (const k of [3, 4, 5]) {
      const direct = estimateRollingHedgeRatio(
        HAND_PANEL,
        config.hedgeWindow,
        config.minObs,
        HAND_PANEL.timestamps[k]!,
      );
      expect(series[k]!.hedgeRatio).toBe(direct.hedgeRatio);
    }
  });

  // ── Leakage invariance (leakage.test.ts pattern) ─────────────────────────

  it('states before index k are invariant to mutations at indices >= k', () => {
    const k = 4;
    const base = buildSpreadSeries(HAND_PANEL, makeConfig());
    const mutated: PairPanel = {
      ...HAND_PANEL,
      closesA: HAND_A.map((v, i) => (i >= k ? 1 : v)),
      closesB: HAND_B.map((v, i) => (i >= k ? 9999 : v)),
    };
    const after = buildSpreadSeries(mutated, makeConfig());
    expect(after.slice(0, k)).toEqual(base.slice(0, k));
  });

  it('shifting the asOf boundary by one step changes the estimate', () => {
    // Distinct window contents per timestamp → β must move step to step.
    const series = buildSpreadSeries(HAND_PANEL, makeConfig());
    expect(series[3]!.hedgeRatio).not.toBeCloseTo(series[4]!.hedgeRatio as number, 9);
    expect(series[4]!.hedgeRatio).not.toBeCloseTo(series[5]!.hedgeRatio as number, 9);
  });

  it('is deterministic — two runs deep-equal', () => {
    const run1 = buildSpreadSeries(HAND_PANEL, makeConfig());
    const run2 = buildSpreadSeries(HAND_PANEL, makeConfig());
    expect(run2).toEqual(run1);
  });
});
