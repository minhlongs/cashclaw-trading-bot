import { describe, it, expect } from 'vitest';
import { runPairSpreadSim } from './simulator';
import {
  NULL_BETA_IDX,
  SHORT_ENTRY_IDX,
  OU_DEV_48,
  T0_OU,
  divergePanel,
  lcg,
  ouPanel,
  simConfig,
} from './simulator-fixtures';
import { VALIDATION_REASONS } from './validation';
import type { PairPanel } from './types';

/** Minimal ramp panel: A = 100+i·10, B = 2·A (degenerate zero spread). */
function panelOf(n: number): PairPanel {
  return {
    legA: 'AAA',
    legB: 'BBB',
    timestamps: Array.from({ length: n }, (_, i) => T0_OU + i * 60_000),
    closesA: Array.from({ length: n }, (_, i) => 100 + i * 10),
    closesB: Array.from({ length: n }, (_, i) => 2 * (100 + i * 10)),
  };
}

/** Truncated prefix of the OU fixture panel (realistic spread, short history). */
function shortOuPanel(n: number): PairPanel {
  return {
    legA: 'AAA',
    legB: 'BBB',
    timestamps: Array.from({ length: n }, (_, i) => T0_OU + i * 60_000),
    closesA: Array.from({ length: n }, (_, i) => 100 + i * 10),
    closesB: Array.from({ length: n }, (_, i) => 2 * (100 + i * 10) + OU_DEV_48[i]!),
  };
}

/** Two independent LCG random walks — non-stationary by construction. */
function randomWalkPanel(seedA: number, seedB: number, n: number): PairPanel {
  const nextA = lcg(seedA);
  const nextB = lcg(seedB);
  let a = 100;
  let b = 100;
  const closesA: number[] = [];
  const closesB: number[] = [];
  for (let i = 0; i < n; i++) {
    closesA.push(Math.round(a));
    closesB.push(Math.round(b));
    a += (nextA() - 0.5) * 6;
    b += (nextB() - 0.5) * 6;
  }
  return {
    legA: 'AAA',
    legB: 'BBB',
    timestamps: Array.from({ length: n }, (_, i) => T0_OU + i * 60_000),
    closesA,
    closesB,
  };
}

describe('runPairSpreadSim — fail-closed paths', () => {
  it('throws on structural violations before any simulation', () => {
    const config = simConfig();
    expect(() => runPairSpreadSim(panelOf(0), config)).toThrow('panel must be non-empty');
    expect(() =>
      runPairSpreadSim({ ...panelOf(5), closesB: [] }, config),
    ).toThrow('lengths differ');
    const nanCloses = panelOf(12);
    const badB = [...nanCloses.closesB];
    badB[7] = Number.NaN;
    expect(() =>
      runPairSpreadSim({ ...nanCloses, closesB: badB }, config),
    ).toThrow('legB close must be positive finite at index 7');
    const dupTs = panelOf(12).timestamps.slice();
    dupTs[5] = dupTs[4]!;
    expect(() =>
      runPairSpreadSim({ ...panelOf(12), timestamps: dupTs }, config),
    ).toThrow('timestamps must be strictly increasing');
    expect(() =>
      runPairSpreadSim(panelOf(5), simConfig({ minObservations: 10 })),
    ).toThrow(/below minObservations 10/);
    expect(() =>
      runPairSpreadSim(panelOf(12), simConfig({ minObservations: 0 })),
    ).toThrow('minObservations must be a positive integer');
    expect(() =>
      runPairSpreadSim(panelOf(30), simConfig({ entryZ: 0.5, exitZ: 0.5 })),
    ).toThrow('entryZ must be strictly greater than exitZ');
  });

  it('yields an honest empty simulation when z never warms up in time', () => {
    const result = runPairSpreadSim(shortOuPanel(12), simConfig());
    expect(result.periods).toEqual([]);
    expect(result.equityCurve).toEqual([1]);
    expect(result.tradeCount).toBe(0);
    expect(result.totalTurnover).toBe(0);
    expect(result.totalCosts).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.validationTrail).toEqual([]);
  });

  it('never trades non-stationary random walks and trails the gate failure', () => {
    const panel = randomWalkPanel(101, 201, 60);
    const result = runPairSpreadSim(panel, simConfig());
    expect(result.periods.length).toBeGreaterThan(0);
    expect(result.tradeCount).toBe(0);
    expect(result.periods.every((p) => p.position === 'flat')).toBe(true);
    expect(result.totalTurnover).toBe(0);
    expect(result.validationTrail.length).toBeGreaterThanOrEqual(1);
    expect(result.validationTrail[0]!.tradable).toBe(false);
    expect(result.validationTrail[0]!.reasons).toContain(
      VALIDATION_REASONS.notCointegrated,
    );
  });

  it('forces FLAT with warnings when β nulls while positioned', () => {
    const panel = divergePanel();
    const config = simConfig({ hedgeWindow: 10, entryZ: 2.2 });
    const result = runPairSpreadSim(panel, config);

    expect(result.tradeCount).toBe(2); // entry + forced-exit transitions
    const crossings = result.periods.filter(
      (p) => p.zScore !== null && Math.abs(p.zScore) >= 2.2,
    );
    expect(crossings).toHaveLength(1);

    const entryPos = result.periods.findIndex((p) => p.position !== 'flat');
    const entry = result.periods[entryPos]!;
    expect(entry.timestamp).toBe(panel.timestamps[SHORT_ENTRY_IDX]);
    expect(entry.position).toBe('short_spread');
    expect(entry.weights['BBB']).toBe(-1);
    expect(entry.weights['AAA']).toBeCloseTo(entry.hedgeRatio!, 12);
    expect(entry.turnover).toBeCloseTo((1 + entry.hedgeRatio!) / 2, 12);

    const exitPos = result.periods.findIndex(
      (p, i) => i > entryPos && p.position === 'flat',
    );
    for (let i = entryPos; i < exitPos; i++) {
      expect(result.periods[i]!.position).toBe('short_spread');
    }
    const exit = result.periods[exitPos]!;
    expect(exit.timestamp).toBe(panel.timestamps[NULL_BETA_IDX]);
    expect(exit.zScore).toBeNull();
    expect(exit.hedgeRatio).toBeNull();
    expect(exit.turnover).toBeGreaterThan(0); // unwind still paid

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/^z-score unavailable at \d+: holding short_spread$/);
    expect(result.warnings[1]).toMatch(/^null hedge ratio at \d+ while short_spread: forced FLAT$/);

    expect(result.validationTrail).toHaveLength(1);
    expect(result.validationTrail[0]!.tradable).toBe(true);
  });

  it('keeps pre-mutation period records byte-identical (leakage invariance)', () => {
    const base = ouPanel();
    const config = simConfig();
    const baseline = runPairSpreadSim(base, config);

    // Mutate every close from index 20 onward: records through index 18
    // (whose return windows end before the cut) must stay untouched.
    const MUTATE_FROM = 20;
    const firstAffectedTime = base.timestamps[MUTATE_FROM - 1]!;
    const mutated: PairPanel = {
      ...base,
      closesA: base.closesA.map((c, i) => (i >= MUTATE_FROM ? c * 1.5 : c)),
      closesB: base.closesB.map((c, i) => (i >= MUTATE_FROM ? c * 1.5 : c)),
    };
    const after = runPairSpreadSim(mutated, config);

    for (const p of baseline.periods) {
      if (p.timestamp >= firstAffectedTime) break;
      const twin = after.periods.find((q) => q.timestamp === p.timestamp);
      expect(JSON.stringify(twin)).toBe(JSON.stringify(p));
    }
    const lateBase = baseline.periods.find((p) => p.timestamp === base.timestamps[25]);
    const lateAfter = after.periods.find((p) => p.timestamp === base.timestamps[25]);
    expect(JSON.stringify(lateAfter)).not.toBe(JSON.stringify(lateBase));
  });

  it('shifts every record when the whole timeline moves, equity path intact', () => {
    const base = ouPanel();
    const config = simConfig();
    const baseline = runPairSpreadSim(base, config);
    const shifted: PairPanel = {
      ...base,
      timestamps: base.timestamps.map((t) => t + 3_600_000),
    };
    const moved = runPairSpreadSim(shifted, config);
    expect(moved.periods).toHaveLength(baseline.periods.length);
    for (let i = 0; i < moved.periods.length; i++) {
      expect(moved.periods[i]!.timestamp).toBe(
        baseline.periods[i]!.timestamp + 3_600_000,
      );
    }
    expect(moved.equityCurve).toEqual(baseline.equityCurve);
    expect(JSON.stringify(moved.periods)).not.toEqual(
      JSON.stringify(baseline.periods),
    );
  });
});
