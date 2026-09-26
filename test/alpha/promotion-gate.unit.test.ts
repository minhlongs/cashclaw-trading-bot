import { describe, it, expect } from 'vitest';
import {
  checkMinTrades,
  checkMinNetExpectancy,
  checkMinProfitFactor,
  checkMaxDrawdown,
  checkMinSharpeSortino,
  checkMinRegimeCoverage,
} from '../../src/forest/alpha/gate/financial-checks';
import { checkFeeStress, checkSlippageStress } from '../../src/forest/alpha/gate/stress-checks';
import {
  checkParameterRobustness,
  checkCrossPeriodRobustness,
  checkCrossAssetRobustness,
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
  checkReproducibleHash,
} from '../../src/forest/alpha/gate/robustness-checks';
import { DEFAULT_PROMOTION_GATE_CONFIG } from '../../src/forest/alpha/gate/types';
import { PromotionGateConfigSchema, PromotionGateInputSchema } from '../../src/forest/alpha/gate/schemas';

describe('Financial Checks (1-6)', () => {
  it('checkMinTrades validates trade counts and rejects non-integers/NaN', () => {
    expect(checkMinTrades(35).passed).toBe(true);
    expect(checkMinTrades(30).passed).toBe(true);
    expect(checkMinTrades(29).passed).toBe(false);
    expect(checkMinTrades(0).passed).toBe(false);
    expect(checkMinTrades(-5).passed).toBe(false);
    expect(checkMinTrades(30.5).passed).toBe(false);
    expect(checkMinTrades(Number.NaN).passed).toBe(false);
  });

  it('checkMinNetExpectancy enforces strictly positive expectancy', () => {
    expect(checkMinNetExpectancy(0.001).passed).toBe(true);
    expect(checkMinNetExpectancy(0.0).passed).toBe(false);
    expect(checkMinNetExpectancy(-0.01).passed).toBe(false);
    expect(checkMinNetExpectancy(Number.NaN).passed).toBe(false);
  });

  it('checkMinProfitFactor validates profit factor boundaries and Infinity', () => {
    expect(checkMinProfitFactor(1.5).passed).toBe(true);
    expect(checkMinProfitFactor(1.2).passed).toBe(true);
    expect(checkMinProfitFactor(1.199).passed).toBe(false);
    expect(checkMinProfitFactor(0).passed).toBe(false);
    expect(checkMinProfitFactor(Infinity).passed).toBe(true);
    expect(checkMinProfitFactor(-1).passed).toBe(false);
    expect(checkMinProfitFactor(Number.NaN).passed).toBe(false);
  });

  it('checkMaxDrawdown verifies peak-to-trough decline ceiling', () => {
    expect(checkMaxDrawdown(0.15).passed).toBe(true);
    expect(checkMaxDrawdown(0.25).passed).toBe(true);
    expect(checkMaxDrawdown(0.2501).passed).toBe(false);
    expect(checkMaxDrawdown(0.0).passed).toBe(true);
    expect(checkMaxDrawdown(1.5).passed).toBe(false);
    expect(checkMaxDrawdown(-0.01).passed).toBe(false);
    expect(checkMaxDrawdown(Number.NaN).passed).toBe(false);
  });

  it('checkMinSharpeSortino tests joint risk-adjusted return hurdle', () => {
    expect(checkMinSharpeSortino(1.5, 1.8).passed).toBe(true);
    expect(checkMinSharpeSortino(1.0, 1.2).passed).toBe(true);
    expect(checkMinSharpeSortino(1.5, 1.19).passed).toBe(false);
    expect(checkMinSharpeSortino(0.99, 1.5).passed).toBe(false);
    expect(checkMinSharpeSortino(null, 1.5).passed).toBe(false);
    expect(checkMinSharpeSortino(1.5, null).passed).toBe(false);
    expect(checkMinSharpeSortino(1.2, Infinity).passed).toBe(true);
    expect(checkMinSharpeSortino(Number.NaN, 1.5).passed).toBe(false);
  });

  it('checkMinRegimeCoverage evaluates profitable share of traded regimes', () => {
    const p = { R1: { numTrades: 10, netPnl: 100 }, R2: { numTrades: 5, netPnl: -20 }, R3: { numTrades: 15, netPnl: 50 }, R4: { numTrades: 0, netPnl: 0 } };
    expect(checkMinRegimeCoverage(p).passed).toBe(true); // 2/3 = 66.7% >= 50%
    const f = { R1: { numTrades: 10, netPnl: -100 }, R2: { numTrades: 5, netPnl: -20 }, R3: { numTrades: 15, netPnl: 50 } };
    expect(checkMinRegimeCoverage(f).passed).toBe(false); // 1/3 = 33.3% < 50%
    expect(checkMinRegimeCoverage({}).passed).toBe(false);
  });
});

describe('Stress Checks (7-8)', () => {
  it('checkFeeStress verifies normal and conservative fee stress survival', () => {
    expect(checkFeeStress(100, 50).passed).toBe(true);
    expect(checkFeeStress(100, 0).passed).toBe(false);
    expect(checkFeeStress(100, -10).passed).toBe(false);
    expect(checkFeeStress(-5, 50).passed).toBe(false);
    expect(checkFeeStress(Number.NaN, 50).passed).toBe(false);
  });

  it('checkSlippageStress verifies adverse and extreme 100 bps stress survival', () => {
    expect(checkSlippageStress(50, 10).passed).toBe(true);
    expect(checkSlippageStress(50, 0).passed).toBe(false);
    expect(checkSlippageStress(50, -5).passed).toBe(false);
    expect(checkSlippageStress(-1, 10).passed).toBe(false);
    expect(checkSlippageStress(50, Number.NaN).passed).toBe(false);
  });
});

describe('Robustness Checks (9-15)', () => {
  it('checkParameterRobustness verifies sensitivity spread ceiling', () => {
    expect(checkParameterRobustness(0.3).passed).toBe(true);
    expect(checkParameterRobustness(0.50).passed).toBe(true);
    expect(checkParameterRobustness(0.501).passed).toBe(false);
    expect(checkParameterRobustness(-0.1).passed).toBe(false);
    expect(checkParameterRobustness(Number.NaN).passed).toBe(false);
  });

  it('checkCrossPeriodRobustness verifies OOS walk-forward positive consistency', () => {
    expect(checkCrossPeriodRobustness(0.80).passed).toBe(true);
    expect(checkCrossPeriodRobustness(0.60).passed).toBe(true);
    expect(checkCrossPeriodRobustness(0.599).passed).toBe(false);
    expect(checkCrossPeriodRobustness(1.2).passed).toBe(false);
    expect(checkCrossPeriodRobustness(Number.NaN).passed).toBe(false);
  });

  it('checkCrossAssetRobustness verifies universality or explicit exemption', () => {
    expect(checkCrossAssetRobustness(0.60, true).passed).toBe(true);
    expect(checkCrossAssetRobustness(0.50, true).passed).toBe(true);
    expect(checkCrossAssetRobustness(0.40, true).passed).toBe(false);
    expect(checkCrossAssetRobustness(null, false).passed).toBe(true);
    expect(checkCrossAssetRobustness(null, true).passed).toBe(false);
  });

  it('checkLeakageInvariance enforces zero lookahead mutations', () => {
    expect(checkLeakageInvariance(0).passed).toBe(true);
    expect(checkLeakageInvariance(1).passed).toBe(false);
    expect(checkLeakageInvariance(-1).passed).toBe(false);
    expect(checkLeakageInvariance(1.5).passed).toBe(false);
  });

  it('checkNoSingleWindowDependency guards against windfall single-window anomalies', () => {
    expect(checkNoSingleWindowDependency([400, 300, 300]).passed).toBe(true); // 40% <= 50%
    expect(checkNoSingleWindowDependency([500, 500]).passed).toBe(true); // 50% <= 50%
    expect(checkNoSingleWindowDependency([600, 400]).passed).toBe(false); // 60% > 50%
    expect(checkNoSingleWindowDependency([1000]).passed).toBe(false); // W=1 fails
    expect(checkNoSingleWindowDependency([-50, -20]).passed).toBe(false); // negative total
    expect(checkNoSingleWindowDependency([]).passed).toBe(false);
    expect(checkNoSingleWindowDependency([100, Number.NaN]).passed).toBe(false);
  });

  it('checkBaselineComparison verifies outperformance against Buy&Hold and Random', () => {
    const cand = { sharpe: 1.5, netPnl: 2000 };
    const bh = { sharpe: 1.0, netPnl: 1000 };
    const re = { sharpe: 0.2, netPnl: 100 };
    expect(checkBaselineComparison(cand, bh, re).passed).toBe(true);
    expect(checkBaselineComparison(cand, { sharpe: 1.6, netPnl: 1000 }, re).passed).toBe(false);
    expect(checkBaselineComparison(cand, { sharpe: 1.0, netPnl: 2500 }, re).passed).toBe(false);
    expect(checkBaselineComparison(cand, bh, { sharpe: 1.7, netPnl: 100 }).passed).toBe(false);
    expect(checkBaselineComparison(cand, bh, { sharpe: 0.2, netPnl: 3000 }).passed).toBe(false);
    expect(checkBaselineComparison(cand, { sharpe: null, netPnl: 500 }, re).passed).toBe(true);
  });

  it('checkReproducibleHash validates canonical hash match', () => {
    expect(checkReproducibleHash(true, { recordedHash: 'abc', expectedHash: 'abc' }).passed).toBe(true);
    expect(checkReproducibleHash(false, { recordedHash: 'abc', expectedHash: 'xyz' }).passed).toBe(false);
    expect(checkReproducibleHash(true, 'canonical hash verified').passed).toBe(true);
    expect(checkReproducibleHash(false).passed).toBe(false);
  });
});

describe('Schemas and Configurations', () => {
  it('validates default gate config schema', () => {
    const parsed = PromotionGateConfigSchema.parse(DEFAULT_PROMOTION_GATE_CONFIG);
    expect(parsed.minTrades).toBe(30);
    expect(parsed.maxDrawdown).toBe(0.25);
  });

  it('validates PromotionGateInputSchema against strict injection', () => {
    const valid = {
      financial: {
        numTrades: 40, expectancy: 1.5, profitFactor: 1.8, maxDrawdown: 0.1, sharpe: 1.5, sortino: 2.0,
        byRegime: { bull: { numTrades: 40, netPnl: 500 } },
      },
      stress: { netPnlNormal: 400, netPnlConservative: 300, netPnlAdverse: 200, netPnlExtreme: 100 },
      robustness: {
        parameterSpread: 0.2, crossPeriodPositiveFraction: 0.8, crossAssetPositiveFraction: 0.7,
        crossAssetApplicable: true, leakageViolations: 0, windowPnls: [100, 200, 150],
        baselineCandidate: { sharpe: 1.5, netPnl: 1000 },
        baselineBuyHold: { sharpe: 0.8, netPnl: 500 },
        baselineRandomEntry: { sharpe: 0.1, netPnl: 50 },
        hashMatches: true,
      },
    };
    expect(PromotionGateInputSchema.parse(valid)).toBeDefined();
    expect(() => PromotionGateInputSchema.parse({ ...valid, extraField: true })).toThrow();
  });
});
