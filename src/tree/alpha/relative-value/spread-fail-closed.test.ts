import { describe, expect, it } from 'vitest';
import { buildSpreadSeries, SPREAD_REASONS } from './spread';
import type { PairPanel, PairSimConfig } from './types';

// Fail-closed degenerate cases for the causal spread series.

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

const N = 12;
const LIN_A = Array.from({ length: N }, (_, i) => 100 + i + 0.5 * Math.sin(i));
const LIN_B = LIN_A.map((a) => 2 * a + 5);

describe('buildSpreadSeries — fail-closed', () => {
  it('short history → every state null + reason, never NaN', () => {
    const panel: PairPanel = {
      legA: 'A', legB: 'B', timestamps: ts(2),
      closesA: [10, 11], closesB: [25, 27],
    };
    const series = buildSpreadSeries(panel, makeConfig());
    expect(series).toHaveLength(2);
    for (const state of series) {
      expect(state.hedgeRatio).toBeNull();
      expect(state.spread).toBeNull();
      expect(state.zScore).toBeNull();
      expect(state.reason).toContain(SPREAD_REASONS.hedgeRatioUnavailable);
    }
  });

  it('flat legA → null + flat-variance reason at every estimable timestamp', () => {
    const panel: PairPanel = {
      legA: 'A', legB: 'B', timestamps: ts(N),
      closesA: Array.from({ length: N }, () => 100),
      closesB: LIN_B,
    };
    const series = buildSpreadSeries(panel, makeConfig());
    expect(series[N - 1]!.reason).toBe(
      `${SPREAD_REASONS.hedgeRatioUnavailable}: legA close variance is zero in window`,
    );
  });

  it('β ≤ 0 synthetic → null + non-positive reason, never a silent spread', () => {
    const panel: PairPanel = {
      legA: 'A', legB: 'B', timestamps: ts(N),
      closesA: LIN_A,
      closesB: LIN_A.map((a) => -2 * a + 500),
    };
    const series = buildSpreadSeries(panel, makeConfig());
    expect(series[N - 1]!.hedgeRatio).toBeNull();
    expect(series[N - 1]!.spread).toBeNull();
    expect(series[N - 1]!.reason).toBe(
      `${SPREAD_REASONS.hedgeRatioUnavailable}: hedge ratio is non-positive`,
    );
  });

  it('zero spread std → fail-closed z with a distinct reason', () => {
    // zWindow = 1 leaves the trailing z-window with a SINGLE spread value,
    // whose deviation from its own mean is exactly 0 → sd === 0 branch.
    // Deterministic under any β rounding; all closes positive finite
    // (invariant: positive close contract).
    const panel: PairPanel = {
      legA: 'A', legB: 'B', timestamps: ts(6),
      closesA: [10, 11, 12, 13, 14, 15],
      closesB: [25, 27, 29, 31, 33, 35],
    };
    const series = buildSpreadSeries(panel, makeConfig({ zWindow: 1 }));
    expect(series[5]!.hedgeRatio).not.toBeNull();
    // s(4) = B(4) − β(t5)·A(4) = 33 − 2·14 = 5 on this fixture.
    expect(series[5]!.spread).toBeCloseTo(5, 9);
    expect(series[5]!.zScore).toBeNull();
    expect(series[5]!.reason).toBe(SPREAD_REASONS.zeroSpreadStd);
  });

  it('never emits NaN — every non-null field is finite', () => {
    const panels: PairPanel[] = [
      {
        legA: 'A', legB: 'B', timestamps: ts(6),
        closesA: [10, 11, 12, 13, 14, 15],
        closesB: [25, 27, 30, 31, 33, 35],
      },
      { legA: 'A', legB: 'B', timestamps: ts(N), closesA: LIN_A, closesB: LIN_B },
    ];
    for (const panel of panels) {
      for (const state of buildSpreadSeries(panel, makeConfig())) {
        for (const value of [state.hedgeRatio, state.spread, state.zScore]) {
          if (value !== null) expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  it('throws on panel length mismatch', () => {
    const bad: PairPanel = {
      legA: 'A', legB: 'B', timestamps: ts(6),
      closesA: [10, 11, 12, 13, 14, 15], closesB: [25, 27, 30, 31, 33],
    };
    expect(() => buildSpreadSeries(bad, makeConfig())).toThrow();
  });
});
