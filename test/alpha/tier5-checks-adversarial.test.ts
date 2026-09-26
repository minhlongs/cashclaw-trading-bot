/**
 * Tier 5 Adversarial Coverage Hardening Test Suite.
 * Exhaustively stress-tests edge-cases and boundary conditions in promotion gate checks.
 */
import { describe, expect, it } from 'vitest';
import {
  checkMinTrades,
  checkMinNetExpectancy,
  checkMinProfitFactor,
  checkMaxDrawdown,
  checkMinSharpeSortino,
  checkMinRegimeCoverage,
} from '@/forest/alpha/gate/financial-checks';
import { checkFeeStress, checkSlippageStress } from '@/forest/alpha/gate/stress-checks';
import {
  checkParameterRobustness,
  checkCrossPeriodRobustness,
  checkCrossAssetRobustness,
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
  checkReproducibleHash,
} from '@/forest/alpha/gate/robustness-checks';
import type { RegimePerformance, BenchmarkMetrics, CandidateBaselineMetrics } from '@/forest/alpha/gate/types';

describe('Tier 5 Adversarial: Financial Checks Edge Cases', () => {
  it('covers minTrades non-integer, negative, and non-finite boundaries', () => {
    expect(checkMinTrades(29.5).passed).toBe(false);
    expect(checkMinTrades(-5).passed).toBe(false);
    expect(checkMinTrades(NaN).actual).toBeNull();
    expect(checkMinTrades(Infinity).detail).toContain('Invalid');
  });

  it('covers minNetExpectancy non-finite and threshold boundaries', () => {
    expect(checkMinNetExpectancy(NaN).actual).toBeNull();
    expect(checkMinNetExpectancy(Infinity).passed).toBe(false);
    expect(checkMinNetExpectancy(-0.01).passed).toBe(false);
    expect(checkMinNetExpectancy(1.5, 2.0).passed).toBe(false);
  });

  it('covers minProfitFactor negative, NaN, and infinite edge values', () => {
    expect(checkMinProfitFactor(-0.5).passed).toBe(false);
    expect(checkMinProfitFactor(NaN).actual).toBeNull();
    expect(checkMinProfitFactor(-Infinity).passed).toBe(false);
    const inf = checkMinProfitFactor(Infinity);
    expect(inf.passed).toBe(true);
    expect(inf.detail).toContain('Infinity');
  });

  it('covers maxDrawdown negative, excess, and non-finite numbers', () => {
    expect(checkMaxDrawdown(-0.05).passed).toBe(false);
    expect(checkMaxDrawdown(0.35).passed).toBe(false);
    expect(checkMaxDrawdown(NaN).actual).toBeNull();
  });

  it('covers minSharpeSortino null, non-finite, and infinite values', () => {
    expect(checkMinSharpeSortino(null, 1.5).passed).toBe(false);
    expect(checkMinSharpeSortino(1.5, null).passed).toBe(false);
    expect(checkMinSharpeSortino(Infinity, Infinity).passed).toBe(true);
    expect(checkMinSharpeSortino(-Infinity, 1.5).passed).toBe(false);
    expect(checkMinSharpeSortino(1.5, -Infinity).passed).toBe(false);
    expect(checkMinSharpeSortino(NaN, 1.5).actual).toBeNull();
  });

  it('covers minRegimeCoverage optional fields, nullish entries, and empty sets', () => {
    const sparse: Record<string, RegimePerformance | undefined | null> = {
      bull: undefined,
      bear: null,
      sideways: {},
      reversion: { numTrades: 10 },
      trend: { numTrades: 5, netPnl: 100 },
    };
    const res = checkMinRegimeCoverage(sparse, 0.5);
    expect(res.passed).toBe(true);
    expect(res.actual).toBe(0.5);

    const empty = checkMinRegimeCoverage({});
    expect(empty.passed).toBe(false);
    expect(empty.actual).toBe(0);

    const nanThresh = checkMinRegimeCoverage({ trend: { numTrades: 5, netPnl: 100 } }, NaN);
    expect(nanThresh.passed).toBe(false);
  });
});

describe('Tier 5 Adversarial: Stress Checks Edge Cases', () => {
  it('covers feeStress non-finite values and asymmetric failures', () => {
    expect(checkFeeStress(NaN, 50).passed).toBe(false);
    expect(checkFeeStress(50, Infinity).passed).toBe(false);
    expect(checkFeeStress(-10, 50).passed).toBe(false);
    expect(checkFeeStress(50, -10).passed).toBe(false);
    expect(checkFeeStress(NaN, NaN).actual).toBeNull();
  });

  it('covers slippageStress non-finite values and asymmetric failures', () => {
    expect(checkSlippageStress(NaN, 50).passed).toBe(false);
    expect(checkSlippageStress(50, -Infinity).passed).toBe(false);
    expect(checkSlippageStress(-5, 20).passed).toBe(false);
    expect(checkSlippageStress(20, -5).passed).toBe(false);
    expect(checkSlippageStress(NaN, NaN).actual).toBeNull();
  });
});

describe('Tier 5 Adversarial: Robustness Checks Edge Cases', () => {
  it('covers parameterRobustness negative, exceeding, and non-finite spread', () => {
    expect(checkParameterRobustness(-0.1).passed).toBe(false);
    expect(checkParameterRobustness(0.7).passed).toBe(false);
    expect(checkParameterRobustness(NaN).actual).toBeNull();
  });

  it('covers crossPeriodRobustness out-of-range (>1.0), sub-threshold, and non-finite', () => {
    expect(checkCrossPeriodRobustness(1.2).passed).toBe(false);
    expect(checkCrossPeriodRobustness(0.4).passed).toBe(false);
    expect(checkCrossPeriodRobustness(NaN).actual).toBeNull();
  });

  it('covers crossAssetRobustness exemptions, missing, and boundary values', () => {
    const exempt = checkCrossAssetRobustness(null, false);
    expect(exempt.passed).toBe(true);
    expect(exempt.actual).toBeNull();

    expect(checkCrossAssetRobustness(undefined, true).passed).toBe(false);
    expect(checkCrossAssetRobustness(null, true).passed).toBe(false);
    expect(checkCrossAssetRobustness(NaN, true).passed).toBe(false);
    expect(checkCrossAssetRobustness(1.5, true).passed).toBe(false);
    expect(checkCrossAssetRobustness(0.2, true).passed).toBe(false);
  });

  it('covers leakageInvariance non-integer and non-finite counts', () => {
    expect(checkLeakageInvariance(1.5).passed).toBe(false);
    expect(checkLeakageInvariance(NaN).actual).toBeNull();
    expect(checkLeakageInvariance(5).passed).toBe(false);
  });

  it('covers noSingleWindowDependency malformed inputs, single window, and non-positive total', () => {
    const malformed = checkNoSingleWindowDependency([] as readonly number[]);
    expect(malformed.passed).toBe(false);

    const nonFinite = checkNoSingleWindowDependency([10, NaN, 20]);
    expect(nonFinite.passed).toBe(false);
    expect(nonFinite.detail).toContain('Non-finite');

    const single = checkNoSingleWindowDependency([100]);
    expect(single.passed).toBe(false);
    expect(single.actual).toBe(1.0);

    const nonPositive = checkNoSingleWindowDependency([-20, -30]);
    expect(nonPositive.passed).toBe(false);
    expect(nonPositive.detail).toContain('non-positive');
  });

  it('covers baselineComparison invalid candidate and baseline variations', () => {
    const candValid: CandidateBaselineMetrics = { sharpe: 1.5, netPnl: 500 };
    const bh: BenchmarkMetrics = { sharpe: 1.0, netPnl: 200 };
    const re: BenchmarkMetrics = { sharpe: 0.8, netPnl: 100 };

    const invalidCand: CandidateBaselineMetrics = { sharpe: NaN, netPnl: 500 };
    expect(checkBaselineComparison(invalidCand, bh, re).passed).toBe(false);

    const bhNullSharpe: BenchmarkMetrics = { sharpe: null, netPnl: 200 };
    const reNullSharpe: BenchmarkMetrics = { sharpe: null, netPnl: 100 };
    expect(checkBaselineComparison(candValid, bhNullSharpe, reNullSharpe).passed).toBe(true);

    const bhHighPnl: BenchmarkMetrics = { sharpe: 1.0, netPnl: 600 };
    expect(checkBaselineComparison(candValid, bhHighPnl, re).passed).toBe(false);

    const reHighSharpe: BenchmarkMetrics = { sharpe: 2.0, netPnl: 100 };
    expect(checkBaselineComparison(candValid, bh, reHighSharpe).passed).toBe(false);
  });

  it('covers reproducibleHash strings, empty objects, and undefined details', () => {
    expect(checkReproducibleHash(true, 'custom detail').detail).toBe('custom detail');
    expect(checkReproducibleHash(false, 'failed detail').detail).toBe('failed detail');

    const passEmptyObj = checkReproducibleHash(true, {});
    expect(passEmptyObj.detail).toContain('match');

    const failEmptyObj = checkReproducibleHash(false, {});
    expect(failEmptyObj.detail).toContain('unknown vs computed unknown');

    const failPartial1 = checkReproducibleHash(false, { recordedHash: 'rec1' });
    expect(failPartial1.detail).toContain('rec1 vs computed unknown');

    const failPartial2 = checkReproducibleHash(false, { expectedHash: 'exp1' });
    expect(failPartial2.detail).toContain('unknown vs computed exp1');

    expect(checkReproducibleHash(true).detail).toBe('Canonical experiment hash verified');
    expect(checkReproducibleHash(false).detail).toBe('Canonical experiment hash mismatch');
  });
});
