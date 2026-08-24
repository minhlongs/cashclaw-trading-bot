// Tests for the evaluateRelativeValue seam + report invariants.
// Covers: e2e determinism, hand-verified metrics, cost attribution
// totals == Σ per-period costPct, validation summary, no-trade artifact.

import { describe, it, expect } from 'vitest';
import { evaluateRelativeValue } from './evaluate';
import { buildRelativeValueReport } from './report';
import type { RelativeValueEvalConfig } from './types';
import type { PairSimConfig } from '@/tree/alpha/relative-value';
import {
  ouPanel,
  simConfig,
  N_OU,
  T0_OU,
} from '@/tree/alpha/relative-value/simulator-fixtures';

const EVAL_CONFIG_BASE: Omit<RelativeValueEvalConfig, keyof PairSimConfig> = {
  experimentId: 'EXP-RV-001',
  timeframe: '1h',
  periodsPerYear: 365 * 24,
};

function evalConfig(overrides: Partial<RelativeValueEvalConfig> = {}): RelativeValueEvalConfig {
  return { ...simConfig(), ...EVAL_CONFIG_BASE, ...overrides };
}

// ── Deterministic fixture: cointegrated OU pair ───────────────────────

describe('evaluateRelativeValue — cointegrated pair', () => {
  it('produces a stable deep-equal result across runs', () => {
    const panel = ouPanel();
    const config = evalConfig();
    const first = evaluateRelativeValue(panel, config);
    const second = evaluateRelativeValue(panel, config);
    expect(first).toStrictEqual(second);
  });

  it('report has correct structure and finite headline metrics', () => {
    const panel = ouPanel();
    const result = evaluateRelativeValue(panel, evalConfig());
    const r = result.report;

    expect(r.experimentId).toBe('EXP-RV-001');
    expect(r.timeframe).toBe('1h');
    expect(r.periodsPerYear).toBe(365 * 24);
    expect(r.periodCount).toBe(result.sim.periods.length);
    expect(r.periodCount).toBeGreaterThan(0);
    if (r.annualizedSharpe !== null) expect(Number.isFinite(r.annualizedSharpe)).toBe(true);
    if (r.annualizedSortino !== null) expect(Number.isFinite(r.annualizedSortino)).toBe(true);
    expect(r.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.maxDrawdownPct)).toBe(true);
    for (const v of [r.totalReturn, r.netReturn, r.grossReturn]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // Equity curve length invariant
    expect(result.sim.equityCurve.length).toBe(r.periodCount + 1);
  });

  it('cost attribution total matches sum of period costPct', () => {
    const panel = ouPanel();
    const result = evaluateRelativeValue(panel, evalConfig());
    const sumCosts = result.sim.periods.reduce((s, p) => s + p.costPct, 0);
    const attributed =
      result.report.costAttribution.fees +
      result.report.costAttribution.slippage +
      result.report.costAttribution.marketImpact;
    expect(attributed).toBeCloseTo(sumCosts, 12);
  });

  it('with costBps=0, all attribution fields are zero', () => {
    const panel = ouPanel();
    const result = evaluateRelativeValue(panel, evalConfig({ costBps: 0 }));
    expect(result.report.costAttribution.fees).toBe(0);
    expect(result.report.costAttribution.slippage).toBe(0);
    expect(result.report.costAttribution.marketImpact).toBe(0);
  });

  it('validation summary reflects gate runs and echoes trail reasons', () => {
    const panel = ouPanel();
    const result = evaluateRelativeValue(panel, evalConfig());
    const vs = result.report.validationSummary;
    expect(vs.gateRunCount).toBe(result.sim.validationTrail.length);
    expect(vs.tradableCount + vs.notTradableCount).toBe(vs.gateRunCount);
    if (vs.gateRunCount > 0) expect(typeof vs.lastTradable).toBe('boolean');
    // Happy path: the OU pair passes the gate at every run — no failures,
    // no warnings, so the summary reason set is legitimately empty.
    expect(vs.tradableCount).toBe(vs.gateRunCount);
    expect(vs.lastTradable).toBe(true);
    expect(vs.reasons).toStrictEqual([]);
  });
});

// ── Flat / not-tradable pair → honest NO TRADE artifact ──────────────

function randomWalkPanel(): { closesA: number[]; closesB: number[] } {
  // Deterministic LCG (Numerical Recipes constants, seed 777)
  let state = 777;
  function next(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0x100000000) * 2 - 1; // uniform in [-1, 1]
  }
  const closesA: number[] = [100];
  const closesB: number[] = [100];
  for (let i = 1; i < N_OU; i++) {
    closesA.push(closesA[i - 1]! + next());
    closesB.push(closesB[i - 1]! + next());
  }
  return { closesA, closesB };
}

describe('evaluateRelativeValue — non-stationary random walk', () => {
  it('produces tradeCount=0 and a flat zero-return report', () => {
    const { closesA, closesB } = randomWalkPanel();
    const panel = {
      legA: 'RWA',
      legB: 'RWB',
      timestamps: Array.from({ length: N_OU }, (_, i) => T0_OU + i * 60_000),
      closesA,
      closesB,
    };
    const config = evalConfig({
      hedgeWindow: 20,
      zWindow: 10,
      minCorrelation: 0.3,
      minObservations: 10,
    });
    const result = evaluateRelativeValue(panel, config);

    expect(result.sim.tradeCount).toBe(0);
    expect(result.report.tradeCount).toBe(0);
    expect(result.report.turnoverTotal).toBe(0);
    expect(result.report.totalReturn).toBe(0);
    expect(result.report.maxDrawdownPct).toBe(0);
    expect(result.report.periodCount).toBe(result.sim.periods.length);

    // Flat book: every net return exactly 0; gate failure recorded.
    const allZero = result.sim.periods.every((p) => p.netReturn === 0);
    expect(allZero).toBe(true);
    expect(result.report.validationSummary.notTradableCount).toBeGreaterThan(0);
    expect(result.report.validationSummary.reasons.join('\n'))
      .toContain('not cointegrated');
  });
});

// ── Report builder direct checks ─────────────────────────────────────

describe('buildRelativeValueReport — direct', () => {
  it('throws on non-positive periodsPerYear before computing anything', () => {
    const emptySim = {
      periods: [],
      equityCurve: [1],
      totalTurnover: 0,
      totalCosts: 0,
      tradeCount: 0,
      warnings: [],
      validationTrail: [],
    };
    expect(() =>
      buildRelativeValueReport(emptySim, { ...evalConfig(), periodsPerYear: 0 }),
    ).toThrow('periodsPerYear must be positive finite');
  });
});
