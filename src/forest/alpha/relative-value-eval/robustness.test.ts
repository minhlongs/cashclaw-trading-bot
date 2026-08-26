import { describe, expect, it } from 'vitest';
import {
  ROBUSTNESS_ENTRY_Z,
  ROBUSTNESS_HEDGE_WINDOWS,
  ROBUSTNESS_RUN_COUNT,
  ROBUSTNESS_STRESS_MODES,
  runRvRobustness,
} from './robustness';
import type {
  PairSelectionConfig,
  UniversePanel,
} from '@/tree/alpha/relative-value';

// ── Fixtures (same deterministic AR(1) pattern as walk-forward tests) ──────

const T0 = 1_700_000_000_000;
const N = 600;

const DEV_AR1: readonly number[] = (() => {
  let state = 48 >>> 0;
  const rnd = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const out: number[] = [5];
  for (let i = 1; i < N; i++) out.push(0.3 * out[i - 1]! + (rnd() - 0.5) * 12);
  return out;
})();

function universe(): UniversePanel {
  const ramp = Array.from({ length: N }, (_, i) => 100 + i * 0.5);
  const legA = ramp.map((r, i) => 1.3 * r + DEV_AR1[i]! + 30);
  const legB = ramp.map((r, i) => 0.7 * r - DEV_AR1[i]! + 80);
  return {
    symbols: ['RAMP', 'LEGA', 'LEGB'],
    timestamps: Array.from({ length: N }, (_, i) => T0 + i * 3_600_000),
    closes: [ramp, legA, legB],
  };
}

const WINDOW_CONFIG = { trainBars: 250, validateBars: 50, testBars: 100, stepBars: 100 };

const selectionConfig: PairSelectionConfig = {
  validationWindow: 80,
  minObs: 10,
  maxHalfLife: 50,
  minCorrelation: 0.5,
  hedgeWindow: 80,
  topK: 3,
};

const BASE_SIM = {
  hedgeWindow: 60,
  zWindow: 5,
  minObs: 10,
  entryZ: 2.0,
  exitZ: 0.5,
  maxHalfLife: 50,
  minCorrelation: 0,
  validationWindow: 60,
  revalidateEvery: 20,
  stressMode: 'conservative' as const,
  minObservations: 30,
};

describe('runRvRobustness', () => {
  const report = runRvRobustness({
    universe: universe(),
    windowConfig: WINDOW_CONFIG,
    mode: 'rolling',
    selectionConfig,
    baseSimConfig: BASE_SIM,
  });

  it('runs exactly the 36-point grid with every axis combination', () => {
    expect(report.entries).toHaveLength(ROBUSTNESS_RUN_COUNT);
    expect(ROBUSTNESS_RUN_COUNT).toBe(36);
    const seen = new Set(
      report.entries.map((e) => `${e.entryZ}|${e.hedgeWindow}|${e.stressMode}`),
    );
    expect(seen.size).toBe(36);
    for (const z of ROBUSTNESS_ENTRY_Z) {
      for (const w of ROBUSTNESS_HEDGE_WINDOWS) {
        for (const s of ROBUSTNESS_STRESS_MODES) {
          expect(seen.has(`${z}|${w}|${s}`)).toBe(true);
        }
      }
    }
  });

  it('produces a rectangular configMatrix over ≥2 windows', () => {
    expect(report.configMatrix.length).toBe(36);
    for (const row of report.configMatrix) {
      expect(row).toHaveLength(report.configMatrix[0]!.length);
      expect(row.length).toBeGreaterThanOrEqual(2);
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('derives the sensitivity report from neighbor deltas', () => {
    const { sensitivity } = report;
    expect(Number.isFinite(sensitivity.maxDelta)).toBe(true);
    expect(sensitivity.normalizedSpread).toBeGreaterThanOrEqual(0);
    expect(sensitivity.normalizedSpread).toBeLessThanOrEqual(1);
    expect(sensitivity.sensitive).toBe(
      sensitivity.normalizedSpread > 0.5,
    );
  });

  it('every entry carries finite expectancy and consistent window counts', () => {
    for (const e of report.entries) {
      expect(Number.isFinite(e.expectancy)).toBe(true);
      expect(e.completedTrades).toBeGreaterThanOrEqual(0);
      expect(e.windowMeans).toHaveLength(e.windowPeriodCounts.length);
    }
  });

  it('is deterministic — two runs deep-equal', () => {
    const again = runRvRobustness({
      universe: universe(),
      windowConfig: WINDOW_CONFIG,
      mode: 'rolling',
      selectionConfig,
      baseSimConfig: BASE_SIM,
    });
    expect(again).toEqual(report);
  });

  it('fails closed when costBps pins costs across the stress axis', () => {
    expect(() =>
      runRvRobustness({
        universe: universe(),
        windowConfig: WINDOW_CONFIG,
        mode: 'rolling',
        selectionConfig,
        baseSimConfig: { ...BASE_SIM, costBps: 10 },
      }),
    ).toThrow(/costBps/);
  });
});
