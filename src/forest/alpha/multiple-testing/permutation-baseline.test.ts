// Multiple-Testing Defense — Permutation Baseline Tests
// Covers: permutationTest happy path + same seed determinism + different seed → different shuffle but stable p-value band;
// compareAgainstRandomEntry: strategy beats baseline → passes, indistinguishable/worse → fails

import { describe, expect, it } from 'vitest';
import { permutationTest, compareAgainstRandomEntry } from './permutation-baseline';
import { mulberry32 } from './seeded-prng';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import { RegimeLabel } from '@/tree/regime/types';
import type { PermutationOptions } from './types';

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function makeStrategyReturns(n: number, edge: number = 0.01, seed: number = 7): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => edge + (rng() - 0.5) * 0.02);
}

function makeEntrySignals(n: number, alignment: number = 0.7, seed: number = 11): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => (rng() < alignment ? 1 : -1));
}

function makeReport(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    experimentId: 'test-exp',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    regime: RegimeLabel.RANGE,
    totalReturn: 100,
    netPnl: 100,
    cagr: 0.5,
    winRate: 0.55,
    lossRate: 0.45,
    profitFactor: 1.5,
    expectancy: 0.02,
    sharpe: 1.2,
    sortino: 1.5,
    maxDrawdown: 0.1,
    avgTrade: 0.5,
    medianTrade: 0.4,
    numTrades: 200,
    turnover: 2,
    fees: 10,
    slippage: 5,
    exposure: 0.8,
    recoveryFactor: 2,
    byRegime: {} as EvaluationReport['byRegime'],
    byMonth: {},
    byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
    ...overrides,
  };
}

describe('permutationTest', () => {
  const baseOptions: PermutationOptions = {
    iterations: 500,
    seed: 42,
  };

  describe('happy path', () => {
    it('returns valid PermutationTestResult with pValue in [0, 1]', () => {
      const returns = makeStrategyReturns(100, 0.02);
      const signals = makeEntrySignals(100, 0.8);
      const result = permutationTest(returns, signals, mean, baseOptions);
      expect(result.observed).toBeDefined();
      expect(result.nullMean).toBeDefined();
      expect(result.nullStd).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
      expect(result.iterations).toBe(baseOptions.iterations);
    });

    it('observed statistic equals mean of aligned series', () => {
      const returns = [0.01, 0.02, 0.03, 0.04];
      const signals = [1, -1, 1, -1];
      // aligned: 0.01*1 + 0.02*(-1) + 0.03*1 + 0.04*(-1) = 0.01 - 0.02 + 0.03 - 0.04 = -0.02
      // mean = -0.02 / 4 = -0.005
      const result = permutationTest(returns, signals, mean, { ...baseOptions, iterations: 10 });
      expect(result.observed).toBeCloseTo(-0.005, 6);
    });
  });

  describe('determinism: same seed → bit-identical output', () => {
    it('identical results on same seed', () => {
      const returns = makeStrategyReturns(100, 0.02);
      const signals = makeEntrySignals(100, 0.7);
      const r1 = permutationTest(returns, signals, mean, { ...baseOptions, seed: 123 });
      const r2 = permutationTest(returns, signals, mean, { ...baseOptions, seed: 123 });
      expect(r1.observed).toBe(r2.observed);
      expect(r1.nullMean).toBe(r2.nullMean);
      expect(r1.nullStd).toBe(r2.nullStd);
      expect(r1.pValue).toBe(r2.pValue);
    });

    it('different seeds produce different shuffles but stable p-value band', () => {
      const returns = makeStrategyReturns(100, 0.02);
      const signals = makeEntrySignals(100, 0.7);
      const r1 = permutationTest(returns, signals, mean, { ...baseOptions, seed: 123 });
      const r2 = permutationTest(returns, signals, mean, { ...baseOptions, seed: 456 });
      // p-values should be in a similar band for the same underlying data
      expect(Math.abs(r1.pValue - r2.pValue)).toBeLessThan(0.3); // stable band
      // but shuffles are different so exact values differ
      const identical = r1.observed === r2.observed && r1.nullMean === r2.nullMean && r1.pValue === r2.pValue;
      expect(identical).toBe(false);
    });
  });

  describe('fail-closed: invalid inputs throw', () => {
    it('returns.length < 2 throws', () => {
      expect(() => permutationTest([1], [1], mean, baseOptions)).toThrow(
        'permutationTest requires at least 2 returns, got 1',
      );
    });

    it('returns/signals length mismatch throws', () => {
      expect(() => permutationTest([1, 2], [1], mean, baseOptions)).toThrow(
        'permutationTest requires aligned arrays: 2 returns vs 1 signals',
      );
    });

    it('iterations < 1 throws', () => {
      expect(() => permutationTest([1, 2], [1, 2], mean, { ...baseOptions, iterations: 0 })).toThrow(
        'permutationTest requires iterations >= 1, got 0',
      );
    });

    it('non-finite seed throws', () => {
      expect(() => permutationTest([1, 2], [1, 2], mean, { ...baseOptions, seed: NaN })).toThrow(
        'permutationTest requires a finite numeric seed',
      );
    });

    it('non-finite statistic result throws', () => {
      const badStat = () => NaN;
      expect(() => permutationTest([1, 2], [1, 2], badStat, baseOptions)).toThrow(
        'permutationTest statistic returned a non-finite value',
      );
    });
  });

  describe('p-value behavior', () => {
    it('strongly aligned signals → low p-value', () => {
      // Constant returns/signals give zero variance under shuffling, so the
      // observed statistic ties every permutation (fail-closed → pValue 1).
      // Use alternating signals correlated with alternating returns so the
      // observed alignment is genuinely better than shuffled alignments.
      const returns = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.03 : -0.01));
      const signals = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 1 : -1));
      const result = permutationTest(returns, signals, mean, { ...baseOptions, iterations: 1000 });
      expect(result.pValue).toBeLessThan(0.05); // should be significant
    });

    it('uncorrelated signals → high p-value', () => {
      const returns = makeStrategyReturns(100, 0, 21); // zero edge, seeded
      const signals = makeEntrySignals(100, 0.5, 23); // random alignment, seeded
      const result = permutationTest(returns, signals, mean, { ...baseOptions, iterations: 1000 });
      expect(result.pValue).toBeGreaterThan(0.1); // should not be significant
    });

    it('anti-aligned signals → p-value near 1', () => {
      const returns = Array(100).fill(0.02); // all positive
      const signals = Array(100).fill(-1); // perfectly anti-aligned
      const result = permutationTest(returns, signals, mean, { ...baseOptions, iterations: 1000 });
      expect(result.pValue).toBeGreaterThan(0.95); // observed is worse than null
    });
  });
});

describe('compareAgainstRandomEntry', () => {
  const baseOptions = { minEdge: 0 };

  describe('happy path', () => {
    it('strategy beats baseline → passes', () => {
      const report = makeReport({ expectancy: 0.05 });
      const baseline = makeReport({ expectancy: 0.01 });
      const result = compareAgainstRandomEntry(report, baseline, baseOptions);
      expect(result.passes).toBe(true);
      expect(result.reason).toContain('exceeds random_entry by');
    });

    it('strategy equals baseline with minEdge=0 → fails (fail-closed, strict edge)', () => {
      // compareAgainstRandomEntry uses strict `edge > minEdge`. Equal
      // expectancy yields edge = 0, which is NOT > 0, so an
      // indistinguishable strategy FAILS — never a silent pass.
      const report = makeReport({ expectancy: 0.02 });
      const baseline = makeReport({ expectancy: 0.02 });
      const result = compareAgainstRandomEntry(report, baseline, baseOptions);
      expect(result.passes).toBe(false);
    });

    it('strategy exceeds baseline by minEdge → passes', () => {
      const report = makeReport({ expectancy: 0.05 });
      const baseline = makeReport({ expectancy: 0.02 });
      const result = compareAgainstRandomEntry(report, baseline, { minEdge: 0.02 });
      expect(result.passes).toBe(true);
    });
  });

  describe('fail cases', () => {
    it('strategy worse than baseline → fails', () => {
      const report = makeReport({ expectancy: 0.01 });
      const baseline = makeReport({ expectancy: 0.05 });
      const result = compareAgainstRandomEntry(report, baseline, baseOptions);
      expect(result.passes).toBe(false);
      expect(result.reason).toContain('edge over random_entry is');
    });

    it('strategy matches baseline but minEdge > 0 → fails', () => {
      const report = makeReport({ expectancy: 0.02 });
      const baseline = makeReport({ expectancy: 0.02 });
      const result = compareAgainstRandomEntry(report, baseline, { minEdge: 0.01 });
      expect(result.passes).toBe(false);
    });

    it('strategy barely exceeds baseline but minEdge higher → fails', () => {
      const report = makeReport({ expectancy: 0.03 });
      const baseline = makeReport({ expectancy: 0.02 });
      const result = compareAgainstRandomEntry(report, baseline, { minEdge: 0.02 });
      expect(result.passes).toBe(false);
    });
  });

  describe('fail-closed: invalid inputs throw', () => {
    it('non-finite strategy expectancy throws', () => {
      const report = makeReport({ expectancy: NaN });
      const baseline = makeReport({ expectancy: 0.02 });
      expect(() => compareAgainstRandomEntry(report, baseline, baseOptions)).toThrow(
        'Strategy report expectancy must be finite',
      );
    });

    it('non-finite baseline expectancy throws', () => {
      const report = makeReport({ expectancy: 0.02 });
      const baseline = makeReport({ expectancy: NaN });
      expect(() => compareAgainstRandomEntry(report, baseline, baseOptions)).toThrow(
        'Baseline report expectancy must be finite',
      );
    });

    it('non-finite minEdge throws', () => {
      const report = makeReport({ expectancy: 0.02 });
      const baseline = makeReport({ expectancy: 0.01 });
      expect(() => compareAgainstRandomEntry(report, baseline, { minEdge: NaN })).toThrow(
        'compareAgainstRandomEntry requires a finite minEdge',
      );
    });
  });
});