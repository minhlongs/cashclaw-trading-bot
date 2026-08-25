import { describe, expect, it } from 'vitest';
import { planWindows, WARMUP_BARS } from './windows';
import { runRVWalkForward, type PairConfigFactory } from './driver';
import type { PairSelectionConfig, UniversePanel } from '@/tree/alpha/relative-value';

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;
const N = 600; // 3 rolling windows of 400 bars (train+validate+test)

/**
 * Deterministic AR(1) deviation (phi = 0.3) from an LCG — same pattern as
 * simulator-fixtures; gives both legs a finite half-life under the gate.
 */
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

/** Rolling-β arm through the ONE engine (runPairSpreadSim via driver). */
const rollingFactory: PairConfigFactory = () => ({
  hedgeWindow: 60,
  zWindow: 5,
  minObs: 10,
  entryZ: 1.5,
  exitZ: 0.5,
  maxHalfLife: 50,
  minCorrelation: 0,
  validationWindow: 60,
  revalidateEvery: 20,
  costBps: 10,
  stressMode: 'conservative',
  minObservations: 30,
});

// ── planWindows ────────────────────────────────────────────────────────────

describe('planWindows', () => {
  it('produces rolling windows with contiguous non-overlapping test spans', () => {
    const planned = planWindows(universe(), WINDOW_CONFIG, 'rolling');
    expect(planned.length).toBeGreaterThanOrEqual(2);
    for (let w = 1; w < planned.length; w++) {
      expect(planned[w]!.bounds.trainStart).toBeGreaterThan(planned[w - 1]!.bounds.trainStart);
      expect(planned[w]!.bounds.testStart).toBeGreaterThan(planned[w - 1]!.bounds.testStart);
    }
    for (const p of planned) {
      expect(p.bounds.testEnd).toBeLessThanOrEqual(N);
      // Warmup overlap: strictly-prior state init, bounded by WARMUP_BARS.
      const warmupBars = p.simUniverse.timestamps.filter(
        (t) => t < p.bounds.testStartTime,
      ).length;
      expect(warmupBars).toBeGreaterThan(0);
      expect(warmupBars).toBeLessThanOrEqual(WARMUP_BARS);
    }
  });

  it('expanding mode keeps trainStart fixed at bar 0 for every window', () => {
    const planned = planWindows(universe(), WINDOW_CONFIG, 'expanding');
    expect(planned.length).toBeGreaterThan(0);
    for (const p of planned) {
      expect(p.bounds.trainStart).toBe(0);
      expect(p.trainUniverse.timestamps.length).toBe(p.bounds.trainEnd);
    }
  });

  it('rolling vs expanding prefix property — expanding trains on a superset', () => {
    const rolling = planWindows(universe(), WINDOW_CONFIG, 'rolling');
    const expanding = planWindows(universe(), WINDOW_CONFIG, 'expanding');
    expect(expanding.length).toBe(rolling.length);
    for (let w = 0; w < rolling.length; w++) {
      expect(expanding[w]!.trainUniverse.timestamps.length)
        .toBeGreaterThanOrEqual(rolling[w]!.trainUniverse.timestamps.length);
    }
  });

  it('fails closed when bars are insufficient or config is degenerate', () => {
    const short = universe().timestamps.slice(0, 100);
    expect(() =>
      planWindows(
        { ...universe(), timestamps: short, closes: universe().closes.map((r) => r.slice(0, 100)) },
        WINDOW_CONFIG,
        'rolling',
      ),
    ).toThrow(/not enough bars/);
    expect(() =>
      planWindows(universe(), { ...WINDOW_CONFIG, stepBars: 0 }, 'rolling'),
    ).toThrow(/stepBars/);
  });
});

// ── runRVWalkForward ───────────────────────────────────────────────────────

describe('runRVWalkForward', () => {
  it('selects pairs causally and produces OOS-only periods per window', () => {
    const result = runRVWalkForward({
      universe: universe(),
      windowConfig: WINDOW_CONFIG,
      mode: 'rolling',
      selectionConfig,
      configFactory: rollingFactory,
    });
    expect(result.windows.length).toBeGreaterThanOrEqual(2);
    for (const pairWin of result.perPairWindows) {
      const win = result.windows.find((w) =>
        w.selectedPairs.some((s) => `${s.legA}/${s.legB}` === pairWin.pairLabel),
      );
      expect(win).toBeDefined();
      const oosStart = win!.bounds.testStartTime;
      for (const period of pairWin.oosPeriods) {
        expect(period.timestamp).toBeGreaterThanOrEqual(oosStart);
      }
    }
    // Stitched returns equal the concatenation of OOS net returns.
    const total = result.perPairWindows.reduce((s, p) => s + p.oosPeriods.length, 0);
    expect(result.stitched.netReturns.length).toBe(total);
  });

  it('SELECTION BLINDNESS — window w selection invariant to mutations at/after its trainEnd', () => {
    const u = universe();
    const args = {
      universe: u,
      windowConfig: WINDOW_CONFIG,
      mode: 'rolling' as const,
      selectionConfig,
      configFactory: rollingFactory,
    };
    const base = runRVWalkForward(args);
    // At least one window must have selected pairs for this proof to bind.
    expect(base.windows.some((w) => w.selectedPairs.length > 0)).toBe(true);
    for (const win of base.windows) {
      const cut = win.bounds.trainEnd;
      const poisoned: UniversePanel = {
        ...u,
        closes: u.closes.map((row) => row.map((v, i) => (i >= cut ? v + 5000 : v))),
      };
      const after = runRVWalkForward({ ...args, universe: poisoned });
      const baseSel = win.selectedPairs;
      const afterSel =
        after.windows.find((w) => w.bounds.trainStart === win.bounds.trainStart)?.selectedPairs;
      expect(afterSel).toEqual(baseSel);
    }
  });

  it('empty-selection window is tolerated — recorded with zero selected pairs, never crashes', () => {
    const impossibleSelection: PairSelectionConfig = { ...selectionConfig, minCorrelation: 2 };
    const result = runRVWalkForward({
      universe: universe(),
      windowConfig: WINDOW_CONFIG,
      mode: 'rolling',
      selectionConfig: impossibleSelection,
      configFactory: rollingFactory,
    });
    expect(result.windows.length).toBeGreaterThan(0);
    for (const w of result.windows) expect(w.selectedPairs).toHaveLength(0);
    expect(result.stitched.netReturns).toHaveLength(0);
  });

  it('is deterministic — two runs deep-equal', () => {
    const args = {
      universe: universe(),
      windowConfig: WINDOW_CONFIG,
      mode: 'expanding' as const,
      selectionConfig,
      configFactory: rollingFactory,
    };
    expect(runRVWalkForward(args)).toEqual(runRVWalkForward(args));
  });
});
