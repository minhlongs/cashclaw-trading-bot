import { describe, it, expect } from 'vitest';
import { runCrossSectionalSim } from './simulator';
import { createUniverse, marketNeutralWeights } from '@/tree/alpha/universe/universe';
import type { CrossSectionalSnapshot, RankedAsset } from '@/tree/alpha/universe/types';
import type { AssetReturnSeries, CrossSectionalSimConfig } from './types';

const UNIVERSE = createUniverse('u1', ['A', 'B', 'C']);

function ranked(symbol: string, score: number, rank: number): RankedAsset {
  return { symbol, score, rank, percentile: 0 };
}

function snapshot(timestamp: number, assets: RankedAsset[]): CrossSectionalSnapshot {
  return { timestamp, universeId: 'u1', assets };
}

// 3 assets, 3 snapshots (2 periods). topN=1, bottomN=1, costBps=10.
const SNAPSHOTS: CrossSectionalSnapshot[] = [
  snapshot(100, [ranked('A', 3, 1), ranked('B', 2, 2), ranked('C', 1, 3)]),
  snapshot(200, [ranked('C', 3, 1), ranked('B', 2, 2), ranked('A', 1, 3)]),
  snapshot(300, [ranked('B', 3, 1), ranked('A', 2, 2), ranked('C', 1, 3)]),
];

const RETURNS: AssetReturnSeries[] = [
  { symbol: 'A', timestamps: [100, 200], returns: [0.01, 0.02] },
  { symbol: 'B', timestamps: [100, 200], returns: [0.005, 0.003] },
  { symbol: 'C', timestamps: [100, 200], returns: [-0.01, 0.04] },
];

const CONFIG: CrossSectionalSimConfig = {
  topN: 1,
  bottomN: 1,
  costBps: 10,
  minObservations: 2,
};

describe('runCrossSectionalSim — hand-computed fixture', () => {
  it('matches hand-computed weights, turnover, gross, net, equity exactly', () => {
    const result = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, CONFIG);

    expect(result.periods).toHaveLength(2);

    // Period 0 (t=100): long A, short C.
    const p0 = result.periods[0];
    expect(p0.timestamp).toBe(100);
    expect(p0.weights).toEqual({ A: 1, C: -1 });
    expect(p0.turnover).toBeCloseTo(1.0, 12); // enter gross-2 book from cash
    expect(p0.grossReturn).toBeCloseTo(0.02, 12); // 1*0.01 + (-1)*(-0.01)
    expect(p0.costPct).toBeCloseTo(0.001, 12); // 1.0 * 10bps
    expect(p0.netReturn).toBeCloseTo(0.019, 12);
    expect(p0.grossExposure).toBeCloseTo(2, 12);
    expect(p0.netExposure).toBeCloseTo(0, 12);

    // Period 1 (t=200): long C, short A.
    const p1 = result.periods[1];
    expect(p1.timestamp).toBe(200);
    expect(p1.weights).toEqual({ C: 1, A: -1 });
    expect(p1.turnover).toBeCloseTo(2.0, 12); // full flip of both legs
    expect(p1.grossReturn).toBeCloseTo(0.02, 12); // 1*0.04 + (-1)*0.02
    expect(p1.costPct).toBeCloseTo(0.002, 12);
    expect(p1.netReturn).toBeCloseTo(0.018, 12);

    expect(result.equityCurve).toHaveLength(3);
    expect(result.equityCurve[0]).toBe(1);
    expect(result.equityCurve[1]).toBeCloseTo(1.019, 12);
    expect(result.equityCurve[2]).toBeCloseTo(1.019 * 1.018, 12);

    expect(result.totalTurnover).toBeCloseTo(3.0, 12);
    expect(result.totalCosts).toBeCloseTo(0.003, 12);
    expect(result.warnings).toEqual([]);
  });
});

describe('runCrossSectionalSim — causality / leakage invariance', () => {
  it('mutating a future snapshot does not change an earlier period', () => {
    const baseline = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, CONFIG);

    // Mutate snapshot at index 2 (future relative to period 0 and 1).
    const mutated = SNAPSHOTS.slice();
    mutated[2] = snapshot(300, [
      ranked('C', 99, 1),
      ranked('B', 50, 2),
      ranked('A', -99, 3),
    ]);
    const after = runCrossSectionalSim(UNIVERSE, mutated, RETURNS, CONFIG);

    expect(after.periods[0]).toEqual(baseline.periods[0]);
    expect(after.periods[1]).toEqual(baseline.periods[1]);
  });

  it('shifting snapshots by one index changes results (no off-by-one future use)', () => {
    const baseline = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, CONFIG);

    // Drop the first snapshot: period weights now come from what was index 1.
    const shifted = SNAPSHOTS.slice(1);
    const after = runCrossSectionalSim(UNIVERSE, shifted, RETURNS, CONFIG);

    expect(after.periods[0].weights).not.toEqual(baseline.periods[0].weights);
  });

  it('weights at t use only snapshot t, never a later snapshot', () => {
    const result = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, CONFIG);
    // Period 0 weights must equal snapshot[0]'s ranking (long A, short C),
    // not snapshot[1]'s (long C, short A).
    expect(result.periods[0].weights).toEqual({ A: 1, C: -1 });
  });
});

describe('runCrossSectionalSim — determinism', () => {
  it('same input twice produces deep-equal output', () => {
    const a = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, CONFIG);
    const b = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, CONFIG);
    expect(b).toEqual(a);
  });

  it('does not mutate input arrays', () => {
    const snapCopy = JSON.parse(JSON.stringify(SNAPSHOTS));
    const retCopy = JSON.parse(JSON.stringify(RETURNS));
    runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, CONFIG);
    expect(SNAPSHOTS).toEqual(snapCopy);
    expect(RETURNS).toEqual(retCopy);
  });
});

describe('runCrossSectionalSim — weighter override', () => {
  it('uses marketNeutralWeights when a weighter is supplied', () => {
    const config: CrossSectionalSimConfig = {
      topN: 0,
      bottomN: 0,
      costBps: 0,
      minObservations: 2,
      weighter: marketNeutralWeights,
    };
    const result = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, config);
    // 3 assets → top 1 long (+1), bottom 1 short (-1), middle excluded.
    expect(result.periods[0].weights).toEqual({ A: 1, C: -1 });
    expect(result.periods[0].netExposure).toBeCloseTo(0, 12);
  });
});

describe('runCrossSectionalSim — fail-closed edge cases', () => {
  it('throws on empty snapshots', () => {
    expect(() => runCrossSectionalSim(UNIVERSE, [], RETURNS, CONFIG)).toThrow(/non-empty/);
  });

  it('throws on empty return panel', () => {
    expect(() => runCrossSectionalSim(UNIVERSE, SNAPSHOTS, [], CONFIG)).toThrow(/non-empty/);
  });

  it('throws when below minObservations', () => {
    const config: CrossSectionalSimConfig = { ...CONFIG, minObservations: 5 };
    expect(() => runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, config)).toThrow(
      /minObservations/,
    );
  });

  it('throws on non-strictly-increasing return timestamps', () => {
    const bad: AssetReturnSeries[] = [
      { symbol: 'A', timestamps: [100, 100], returns: [0.01, 0.02] },
      { symbol: 'B', timestamps: [100, 200], returns: [0.005, 0.003] },
      { symbol: 'C', timestamps: [100, 200], returns: [-0.01, 0.04] },
    ];
    expect(() => runCrossSectionalSim(UNIVERSE, SNAPSHOTS, bad, CONFIG)).toThrow(
      /strictly increasing/,
    );
  });

  it('throws on timestamps/returns length mismatch', () => {
    const bad: AssetReturnSeries[] = [
      { symbol: 'A', timestamps: [100, 200], returns: [0.01] },
      { symbol: 'B', timestamps: [100, 200], returns: [0.005, 0.003] },
      { symbol: 'C', timestamps: [100, 200], returns: [-0.01, 0.04] },
    ];
    expect(() => runCrossSectionalSim(UNIVERSE, SNAPSHOTS, bad, CONFIG)).toThrow(/mismatch/);
  });

  it('throws when a snapshot symbol is missing from the return panel', () => {
    const partial = RETURNS.filter((s) => s.symbol !== 'C');
    expect(() => runCrossSectionalSim(UNIVERSE, SNAPSHOTS, partial, CONFIG)).toThrow(
      /missing from return panel/,
    );
  });

  it('throws on universeId mismatch', () => {
    const other = createUniverse('other', ['A', 'B', 'C']);
    expect(() => runCrossSectionalSim(other, SNAPSHOTS, RETURNS, CONFIG)).toThrow(
      /universeId/,
    );
  });

  it('throws on invalid config', () => {
    expect(() =>
      runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, { ...CONFIG, topN: -1 }),
    ).toThrow(/topN/);
    expect(() =>
      runCrossSectionalSim(UNIVERSE, SNAPSHOTS, RETURNS, { ...CONFIG, costBps: -5 }),
    ).toThrow(/costBps/);
  });

  it('warns (never forward-fills) when a held symbol misses one period return', () => {
    // C has no return at t=200; period 1 excludes C and records a warning.
    const partial: AssetReturnSeries[] = [
      { symbol: 'A', timestamps: [100, 200], returns: [0.01, 0.02] },
      { symbol: 'B', timestamps: [100, 200], returns: [0.005, 0.003] },
      { symbol: 'C', timestamps: [100], returns: [-0.01] },
    ];
    const result = runCrossSectionalSim(UNIVERSE, SNAPSHOTS, partial, CONFIG);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/C/);
    // Period 1 gross = only A's short leg: (-1)*0.02 = -0.02 (C excluded).
    expect(result.periods[1].grossReturn).toBeCloseTo(-0.02, 12);
  });

  it('throws when no held asset has a return at a period timestamp', () => {
    // Neither A nor C (the held assets at t=100) has a return at t=100.
    const misaligned: AssetReturnSeries[] = [
      { symbol: 'A', timestamps: [200], returns: [0.02] },
      { symbol: 'B', timestamps: [100, 200], returns: [0.005, 0.003] },
      { symbol: 'C', timestamps: [200], returns: [0.04] },
    ];
    expect(() => runCrossSectionalSim(UNIVERSE, SNAPSHOTS, misaligned, CONFIG)).toThrow(
      /no held asset/,
    );
  });
});
