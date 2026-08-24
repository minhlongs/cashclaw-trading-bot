// Tests for the wire-in seam evaluateCrossSectional (plan §3 Step D).
// Covers: end-to-end determinism, beta targeting toward the target with
// sufficient history, fail-closed fallback on insufficient history, and
// verbatim error propagation from validation/sizing/sim/report layers.

import { describe, it, expect } from 'vitest';
import { evaluateCrossSectional } from './evaluate';
import type { CrossSectionalEvalConfig } from './evaluate-config';
import { rankAssets } from '@/tree/alpha/universe/universe';
import { runCrossSectionalSim } from '@/tree/alpha/cross-sectional/simulator';
import type {
  AssetReturnSeries,
  CrossSectionalSimConfig,
} from '@/tree/alpha/cross-sectional/types';
import type { CrossSectionalSnapshot, Universe } from '@/tree/alpha/universe/types';
import { RegimeLabel } from '@/tree/regime/types';

const UNIVERSE: Universe = {
  id: 'U-TEST',
  symbols: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'],
  weighting: 'equal',
  rebalanceRule: 'daily',
};

const BASE_EVAL_CONFIG = {
  topN: 2,
  bottomN: 2,
  minObservations: 2,
  costBps: 0,
  experimentId: 'EXP-WIRE',
  timeframe: '1h',
  regime: RegimeLabel.RANGE,
  periodsPerYear: 365 * 24,
} satisfies CrossSectionalEvalConfig;

/** Rotating deterministic scores so ranks cycle across snapshots. */
function buildRotatingSnapshots(times: readonly number[]): CrossSectionalSnapshot[] {
  const symbols = UNIVERSE.symbols;
  return times.map((t, i) => {
    const scores: Record<string, number> = {};
    for (let j = 0; j < symbols.length; j++) {
      scores[symbols[j]!] = (((j - i) % symbols.length) + symbols.length) % symbols.length;
    }
    return { timestamp: t, universeId: UNIVERSE.id, assets: rankAssets(scores) };
  });
}

/** Deterministic pseudo-random panel in [-0.02, 0.02]. */
function buildPanel(symbols: readonly string[], times: readonly number[]): AssetReturnSeries[] {
  return symbols.map((symbol, j) => ({
    symbol,
    timestamps: times,
    returns: times.map((_, i) => (((i * 7 + j * 13) % 21) - 10) / 500),
  }));
}

describe('evaluateCrossSectional — end-to-end determinism', () => {
  const TIMES = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];

  it('produces a stable deep-equal result across runs on a 5x10 fixture', () => {
    const snapshots = buildRotatingSnapshots(TIMES);
    const panel = buildPanel(UNIVERSE.symbols, TIMES);

    const a = evaluateCrossSectional(UNIVERSE, snapshots, panel, BASE_EVAL_CONFIG);
    const b = evaluateCrossSectional(UNIVERSE, snapshots, panel, BASE_EVAL_CONFIG);

    expect(a).toEqual(b);
    expect(a.sim.periods).toHaveLength(9);
    expect(a.sim.equityCurve).toHaveLength(10);
    expect(a.report.periodCount).toBe(9);
    expect(a.sizing).toEqual({ betaApplied: false });
    expect(a.report.realizedBetaSeries).toEqual([]);
  });

  it('runs the default long/short book when targetBeta is omitted (betaApplied false)', () => {
    const snapshots = buildRotatingSnapshots(TIMES);
    const panel = buildPanel(UNIVERSE.symbols, TIMES);
    const result = evaluateCrossSectional(UNIVERSE, snapshots, panel, BASE_EVAL_CONFIG);

    // Every period holds 2 long (+0.5) and 2 short (-0.5) positions.
    for (const period of result.sim.periods) {
      const entries = Object.entries(period.weights);
      expect(entries).toHaveLength(4);
      for (const [, weight] of entries) {
        expect(Math.abs(weight)).toBeCloseTo(0.5, 12);
      }
      expect(period.netExposure).toBeCloseTo(0, 12);
    }
  });
});

describe('evaluateCrossSectional — beta-aware sizing', () => {
  // Fixed betas vs benchmark; asset returns are EXACTLY beta * benchmark so
  // OLS recovers them perfectly and realized beta is hand-checkable.
  const BETAS: Record<string, number> = { AAA: 2, BBB: 1, CCC: 0.5, DDD: 1, EEE: 1.5 };
  const WARMUP = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000];
  const SNAP_TIMES = [10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000];
  const ALL_TIMES = [...WARMUP, ...SNAP_TIMES];

  function buildBetaWorld(): {
    snapshots: CrossSectionalSnapshot[];
    panel: AssetReturnSeries[];
    benchmark: AssetReturnSeries;
  } {
    // Fixed ranking: long {AAA, BBB}, short {DDD, EEE}, CCC idle.
    const snapshots = SNAP_TIMES.map((t) => ({
      timestamp: t,
      universeId: UNIVERSE.id,
      assets: rankAssets({ AAA: 5, BBB: 4, CCC: 3, DDD: 2, EEE: 1 }),
    }));
    const benchmark: AssetReturnSeries = {
      symbol: 'BENCH',
      timestamps: ALL_TIMES,
      returns: ALL_TIMES.map((_, i) => ((i % 7) - 3) / 50),
    };
    const panel = UNIVERSE.symbols.map((symbol) => ({
      symbol,
      timestamps: ALL_TIMES,
      returns: ALL_TIMES.map((_, i) => BETAS[symbol]! * benchmark.returns[i]!),
    }));
    return { snapshots, panel, benchmark };
  }

  function evalConfig(targetBeta: number): CrossSectionalEvalConfig {
    return { ...BASE_EVAL_CONFIG, targetBeta, betaWindow: 20, betaMinObs: 6 };
  }

  it('scales every rebalance toward targetBeta and reports realized betas at target', () => {
    const { snapshots, panel, benchmark } = buildBetaWorld();

    // βp = 0.5·2 + 0.5·1 − 0.5·1 − 0.5·1.5 = 0.25; scale = 0.5 / 0.25 = 2.
    const result = evaluateCrossSectional(UNIVERSE, snapshots, panel, {
      ...evalConfig(0.5),
      benchmarkReturns: benchmark,
    });

    expect(result.sizing).toEqual({ betaApplied: true });
    expect(result.sim.periods).toHaveLength(9);
    expect(result.report.realizedBetaSeries).toHaveLength(9);
    for (const realized of result.report.realizedBetaSeries) {
      expect(realized).toBeCloseTo(0.5, 6);
    }
    // First-period weights doubled vs equal weight.
    const first = result.sim.periods[0]!.weights;
    expect(first.AAA).toBeCloseTo(1, 9);
    expect(first.BBB).toBeCloseTo(1, 9);
    expect(first.DDD).toBeCloseTo(-1, 9);
    expect(first.EEE).toBeCloseTo(-1, 9);
    expect(first.CCC).toBeUndefined();
  });

  it('fails closed to equal weights when history is insufficient, sim still completes', () => {
    const { snapshots, panel, benchmark } = buildBetaWorld();
    // Strip warmup: at most 8 prior observations exist, below betaMinObs 10.
    const coldStart = (series: AssetReturnSeries): AssetReturnSeries => ({
      ...series,
      timestamps: series.timestamps.filter((t) => t >= SNAP_TIMES[0]!),
      returns: series.returns.slice(WARMUP.length),
    });

    const result = evaluateCrossSectional(UNIVERSE, snapshots, panel.map(coldStart), {
      ...evalConfig(0.5),
      betaMinObs: undefined,
      benchmarkReturns: coldStart(benchmark),
    });

    expect(result.sizing.betaApplied).toBe(false);
    expect(result.sizing.fallbackReason).toContain('missing beta estimate');
    expect(result.report.realizedBetaSeries).toEqual([]);

    // Sim completed anyway on the snapshot's own equal weights.
    expect(result.sim.periods).toHaveLength(9);
    const firstWeights = result.sim.periods[0]!.weights;
    expect(firstWeights.AAA).toBeCloseTo(0.5, 12);
    expect(firstWeights.BBB).toBeCloseTo(0.5, 12);
    expect(firstWeights.DDD).toBeCloseTo(-0.5, 12);
    expect(firstWeights.EEE).toBeCloseTo(-0.5, 12);

    // Identical to running the plain simulator with no sizing hook.
    const plainConfig: CrossSectionalSimConfig = {
      topN: 2,
      bottomN: 2,
      minObservations: 2,
      costBps: 0,
    };
    const plain = runCrossSectionalSim(UNIVERSE, snapshots, panel.map(coldStart), plainConfig);
    expect(result.sim).toEqual(plain);
  });
});

describe('evaluateCrossSectional — validation and error propagation', () => {
  const TIMES = [1000, 2000, 3000, 4000, 5000];
  const snapshots = buildRotatingSnapshots(TIMES);
  const panel = buildPanel(UNIVERSE.symbols, TIMES);

  it('rejects an empty return panel before any computation', () => {
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, [], BASE_EVAL_CONFIG),
    ).toThrow(/assetReturnSeries must be non-empty/);
  });

  it('requires benchmarkReturns when targetBeta is non-zero', () => {
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, { ...BASE_EVAL_CONFIG, targetBeta: 0.5 }),
    ).toThrow(/benchmarkReturns is required/);
  });

  it('rejects non-finite targetBeta', () => {
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, {
        ...BASE_EVAL_CONFIG,
        targetBeta: Number.NaN,
        benchmarkReturns: panel[0]!,
      }),
    ).toThrow(/targetBeta must be a finite number/);
  });

  it('rejects invalid periodsPerYear, betaWindow, and betaMinObs before computing', () => {
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, { ...BASE_EVAL_CONFIG, periodsPerYear: 0 }),
    ).toThrow(/periodsPerYear/);
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, { ...BASE_EVAL_CONFIG, betaWindow: 0 }),
    ).toThrow(/betaWindow/);
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, { ...BASE_EVAL_CONFIG, betaMinObs: -1 }),
    ).toThrow(/betaMinObs/);
  });

  it('rejects regime label arrays whose length differs from the period count', () => {
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, {
        ...BASE_EVAL_CONFIG,
        regimeLabels: [RegimeLabel.RANGE, RegimeLabel.SHOCK],
      }),
    ).toThrow(/regimeLabels length \(2\) must equal period count \(4\)/);
  });

  it('propagates simulator failures verbatim (symbol missing from panel)', () => {
    const shortPanel = panel.filter((s) => s.symbol !== 'EEE');
    expect(() => evaluateCrossSectional(UNIVERSE, snapshots, shortPanel, BASE_EVAL_CONFIG)).toThrow(
      /runCrossSectionalSim: snapshot symbol 'EEE' missing from return panel/,
    );
  });

  it('propagates sim-config validation errors verbatim', () => {
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, { ...BASE_EVAL_CONFIG, topN: -1 }),
    ).toThrow(/topN must be a non-negative integer/);
  });

  it('rejects misaligned snapshots (universe mismatch, duplicates, degenerate counts)', () => {
    const foreign = snapshots.map((s) => ({ ...s, universeId: 'OTHER' }));
    expect(() => evaluateCrossSectional(UNIVERSE, foreign, panel, BASE_EVAL_CONFIG)).toThrow(
      /universeId 'OTHER' does not match universe/,
    );

    const duplicated = [
      snapshots[0]!,
      { ...snapshots[1]!, timestamp: snapshots[0]!.timestamp },
      ...snapshots.slice(2),
    ];
    expect(() => evaluateCrossSectional(UNIVERSE, duplicated, panel, BASE_EVAL_CONFIG)).toThrow(
      /strictly increasing/,
    );

    expect(() => evaluateCrossSectional(UNIVERSE, [snapshots[0]!], panel, BASE_EVAL_CONFIG)).toThrow(
      /at least 2 snapshots/,
    );
    expect(() =>
      evaluateCrossSectional(UNIVERSE, snapshots, panel, { ...BASE_EVAL_CONFIG, minObservations: 99 }),
    ).toThrow(/below minObservations 99/);
  });
});
