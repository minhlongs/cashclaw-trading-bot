// Tests for evaluateValue — realized-beta diagnostic + errors.
// Diagnostic only: present iff benchmarkReturns supplied, never affects
// sizing; strictly-before windows inherited from estimateRollingBetas.

import { describe, it, expect } from 'vitest';
import { evaluateRelativeValue } from './evaluate';
import type { RelativeValueEvalConfig } from './types';
import type { PairSimConfig } from '@/tree/alpha/relative-value';
import {
  ouPanel,
  simConfig,
  N_OU,
} from '@/tree/alpha/relative-value/simulator-fixtures';

const EVAL_CONFIG_BASE: Omit<RelativeValueEvalConfig, keyof PairSimConfig> = {
  experimentId: 'EXP-RV-002',
  timeframe: '1h',
  periodsPerYear: 365 * 24,
};

function evalConfig(overrides: Partial<RelativeValueEvalConfig> = {}): RelativeValueEvalConfig {
  return { ...simConfig(), ...EVAL_CONFIG_BASE, ...overrides };
}

/** Benchmark series aligned to panel period timestamps (n-1 entries). */
function benchFor(panel: ReturnType<typeof ouPanel>, scale = 0.005) {
  const returns = Array.from({ length: N_OU - 1 }, (_, i) => {
    const legAReturn = panel.closesA[i + 1]! / panel.closesA[i]! - 1;
    return legAReturn * scale;
  });
  return {
    symbol: 'BENCH',
    timestamps: panel.timestamps.slice(0, N_OU - 1),
    returns,
  };
}

describe('evaluateRelativeValue — realized beta diagnostic', () => {
  it('present only when benchmarkReturns supplied; length matches periods', () => {
    const panel = ouPanel();
    const configWithBench = evalConfig({
      benchmarkReturns: benchFor(panel),
      betaWindow: 15,
      betaMinObs: 5,
    });
    const withBench = evaluateRelativeValue(panel, configWithBench);
    const series = withBench.report.realizedPairBetaSeries;
    expect(series).toBeDefined();
    expect(series!.length).toBe(withBench.sim.periods.length);
    for (const b of series!) expect(Number.isFinite(b)).toBe(true);

    // Without benchmark => absent
    const withoutBench = evaluateRelativeValue(panel, evalConfig());
    expect(withoutBench.report.realizedPairBetaSeries).toBeUndefined();
  });

  it('diagnostic only: identical sim with and without benchmark', () => {
    const panel = ouPanel();
    const plain = evaluateRelativeValue(panel, evalConfig());
    const withDiag = evaluateRelativeValue(panel, evalConfig({
      benchmarkReturns: benchFor(panel),
      betaWindow: 15,
      betaMinObs: 5,
    }));
    expect(withDiag.sim).toStrictEqual(plain.sim);
  });

  it('strictly-before windows: mutating future benchmark returns changes nothing', () => {
    const panel = ouPanel();
    const base = evaluateRelativeValue(panel, evalConfig({
      benchmarkReturns: benchFor(panel),
      betaWindow: 15,
      betaMinObs: 5,
    }));

    // Mutate the benchmark entry whose timestamp EQUALS the last period's
    // decision timestamp: strict-before excludes it for every period, so
    // the diagnostic must be byte-identical. (Earlier entries ARE strictly
    // before later decisions — mutating those SHOULD move the value.)
    const mutatedBench = benchFor(panel);
    mutatedBench.returns[N_OU - 2] = -7;
    const afterMutation = evaluateRelativeValue(panel, evalConfig({
      benchmarkReturns: mutatedBench,
      betaWindow: 15,
      betaMinObs: 5,
    }));
    expect(afterMutation.report.realizedPairBetaSeries)
      .toStrictEqual(base.report.realizedPairBetaSeries);
  });

  it('deterministic across runs', () => {
    const panel = ouPanel();
    const config = evalConfig({ benchmarkReturns: benchFor(panel), betaWindow: 15 });
    expect(evaluateRelativeValue(panel, config))
      .toStrictEqual(evaluateRelativeValue(panel, config));
  });
});

// ── Error propagation ─────────────────────────────────────────────────

describe('evaluateRelativeValue — error propagation', () => {
  it('propagates validation errors before any computation', () => {
    const panel = ouPanel();
    expect(() =>
      evaluateRelativeValue(panel, evalConfig({ entryZ: 0.5, exitZ: 2.0 })),
    ).toThrow('entryZ must be strictly greater than exitZ');
  });

  it('propagates simulator config errors', () => {
    const panel = ouPanel();
    expect(() =>
      evaluateRelativeValue(panel, evalConfig({ minObservations: 0 })),
    ).toThrow('minObservations');
  });

  it('errors carry the layer prefix that raised them', () => {
    // Seam-level validator fires before the simulator's own checks.
    const panel = ouPanel();
    try {
      evaluateRelativeValue(panel, evalConfig({ entryZ: 0.5, exitZ: 2.0 }));
      expect.unreachable('expected throw');
    } catch (error) {
      expect((error as Error).message.startsWith('evaluateRelativeValue:')).toBe(true);
    }
  });
});
