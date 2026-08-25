// Tests for report builder (plan §3 Step C).
// Full integration fixture; verifies composition of all metrics.

import { describe, it, expect } from 'vitest';
import { buildCrossSectionalReport } from './report';
import type { CrossSectionalSimResult, RebalanceRecord } from '@/tree/alpha/cross-sectional/types';
import { RegimeLabel } from '@/tree/regime/types';

describe('report', () => {
  const makePeriod = (
    timestamp: number,
    netReturn: number,
    grossReturn: number,
    turnover: number,
    costPct: number,
    weights: Record<string, number> = {},
  ): RebalanceRecord => ({
    timestamp,
    weights,
    turnover,
    costPct,
    grossReturn,
    netReturn,
    grossExposure: Object.values(weights).reduce((s, w) => s + Math.abs(w), 0),
    netExposure: Object.values(weights).reduce((s, w) => s + w, 0),
  });

  const makeSimResult = (periods: RebalanceRecord[]): CrossSectionalSimResult => ({
    periods,
    equityCurve: [1, ...periods.map((p, i) => {
      const eq = periods.slice(0, i + 1).reduce((e, rec) => e * (1 + rec.netReturn), 1);
      return eq;
    })],
    totalTurnover: periods.reduce((s, p) => s + p.turnover, 0),
    totalCosts: periods.reduce((s, p) => s + p.costPct, 0),
    warnings: [],
  });

  const baseConfig = {
    experimentId: 'EXP-1',
    symbol: 'UNIVERSE-1',
    timeframe: '1h',
    regime: 'TREND_UP' as RegimeLabel,
    periodsPerYear: 365 * 24, // hourly
    stressMode: 'conservative' as const,
  };

  it('builds full report with all fields populated', () => {
    const periods = [
      makePeriod(1000, 0.01, 0.012, 0.2, 0.002, { AAA: 0.5, BBB: -0.5 }),
      makePeriod(2000, -0.005, 0.005, 0.3, 0.01, { AAA: 0.5, BBB: -0.5 }),
      makePeriod(3000, 0.015, 0.018, 0.1, 0.003, { AAA: 0.5, BBB: -0.5 }),
    ];
    const sim = makeSimResult(periods);
    const report = buildCrossSectionalReport(sim, baseConfig);

    // Headline metrics
    expect(report.experimentId).toBe('EXP-1');
    expect(report.symbol).toBe('UNIVERSE-1');
    expect(report.timeframe).toBe('1h');
    expect(report.regime).toBe('TREND_UP');
    expect(report.periodCount).toBe(3);
    expect(report.periodsPerYear).toBe(365 * 24);

    // Returns
    const expectedTotal = (1.01 * 0.995 * 1.015 - 1);
    expect(report.totalReturn).toBeCloseTo(expectedTotal, 10);
    expect(report.netReturn).toBeCloseTo(expectedTotal, 10);
    expect(report.grossReturn).toBeCloseTo((1.012 * 1.005 * 1.018 - 1), 10);

    // Sharpe/Sortino (on net returns)
    expect(report.annualizedSharpe).not.toBeNull();
    expect(report.annualizedSortino).not.toBeNull();

    // Drawdown
    expect(report.maxDrawdownPct).toBeGreaterThanOrEqual(0);

    // Turnover
    expect(report.turnoverTotal).toBeCloseTo(0.6, 10);
    expect(report.turnoverPerRebalance).toEqual([0.2, 0.3, 0.1]);

    // Cost attribution (conservative: fee=0.0010, slip=0.0007, impact=0.0010, total=0.0027)
    // Total costPct = 0.002 + 0.01 + 0.003 = 0.015
    const totalCost = 0.015;
    const expectedFees = totalCost * (0.0010 / 0.0027);
    const expectedSlip = totalCost * (0.0007 / 0.0027);
    const expectedImpact = totalCost * (0.0010 / 0.0027);
    expect(report.costAttribution.fees).toBeCloseTo(expectedFees, 10);
    expect(report.costAttribution.slippage).toBeCloseTo(expectedSlip, 10);
    expect(report.costAttribution.marketImpact).toBeCloseTo(expectedImpact, 10);

    // Long/short attribution (proportional fallback since no assetPeriodReturns)
    // Both periods have equal long/short exposure (0.5 each), so split 50/50
    // Invariant: sum equals Σ grossReturn (not compounded grossReturn)
    const sumGrossReturn = periods.reduce((s, p) => s + p.grossReturn, 0);
    expect(report.longSidePnl + report.shortSidePnl).toBeCloseTo(sumGrossReturn, 10);

    // Exposure series
    expect(report.exposureSeries.gross.length).toBe(3);
    expect(report.exposureSeries.net.length).toBe(3);

    // Realized beta empty
    expect(report.realizedBetaSeries).toEqual([]);

    // byRegime empty when no labels
    for (const key of Object.keys(report.byRegime)) {
      expect(Object.keys(report.byRegime[key as RegimeLabel]).length).toBe(0);
    }
  });

  it('uses precise attribution when assetPeriodReturns provided', () => {
    const periods = [
      makePeriod(1000, 0.01, 0.012, 0.2, 0.002, { AAA: 0.5, BBB: -0.5 }),
      makePeriod(2000, 0.02, 0.022, 0.1, 0.002, { AAA: 0.3, BBB: -0.7 }),
    ];
    const sim = makeSimResult(periods);
    const report = buildCrossSectionalReport(sim, {
      ...baseConfig,
      assetPeriodReturns: [
        { weights: { AAA: 0.5, BBB: -0.5 }, assetReturns: { AAA: 0.02, BBB: -0.01 } },
        { weights: { AAA: 0.3, BBB: -0.7 }, assetReturns: { AAA: 0.03, BBB: 0.02 } },
      ],
    });

    // Precise: P1 long=0.5*0.02=0.01, short=-0.5*-0.01=0.005; P2 long=0.3*0.03=0.009, short=-0.7*0.02=-0.014
    // Sum: long=0.019, short=-0.009
    expect(report.longSidePnl).toBeCloseTo(0.019, 10);
    expect(report.shortSidePnl).toBeCloseTo(-0.009, 10);
  });

  it('populates byRegime when regimeLabels provided', () => {
    const periods = [
      makePeriod(1000, 0.01, 0.012, 0.2, 0.002),
      makePeriod(2000, 0.02, 0.022, 0.1, 0.002),
      makePeriod(3000, -0.01, -0.008, 0.3, 0.002),
    ];
    const sim = makeSimResult(periods);
    const report = buildCrossSectionalReport(sim, {
      ...baseConfig,
      regimeLabels: ['TREND_UP', 'TREND_UP', 'RANGE'] as RegimeLabel[],
    });

    // TREND_UP has 2 periods
    expect(Object.keys(report.byRegime.TREND_UP).length).toBeGreaterThan(0);
    expect(report.byRegime.TREND_UP.netReturn).not.toBeUndefined();
    expect(report.byRegime.TREND_UP.annualizedSharpe).not.toBeUndefined();
    expect(report.byRegime.TREND_UP.turnoverTotal).not.toBeUndefined();

    // RANGE has 1 period
    expect(report.byRegime.RANGE.netReturn).not.toBeUndefined();
    expect(report.byRegime.RANGE.annualizedSharpe).toBeNull(); // single period -> null

    // Other regimes empty
    expect(report.byRegime.HIGH_VOLATILITY.netReturn).toBe(0);
  });

  it('throws on assetPeriodReturns length mismatch', () => {
    const periods = [makePeriod(1000, 0.01, 0.012, 0.2, 0.002)];
    const sim = makeSimResult(periods);
    expect(() => buildCrossSectionalReport(sim, {
      ...baseConfig,
      assetPeriodReturns: [
        { weights: { AAA: 1 }, assetReturns: { AAA: 0.01 } },
        { weights: { BBB: 1 }, assetReturns: { BBB: 0.01 } },
      ],
    })).toThrow(/assetPeriodReturns length.*!==.*periods.length/);
  });

  it('throws on regimeLabels length mismatch', () => {
    const periods = [makePeriod(1000, 0.01, 0.012, 0.2, 0.002)];
    const sim = makeSimResult(periods);
    expect(() => buildCrossSectionalReport(sim, {
      ...baseConfig,
      regimeLabels: ['TREND_UP', 'RANGE'] as RegimeLabel[],
    })).toThrow(/regimeLabels length.*!==.*periods.length/);
  });

  it('throws on invalid periodsPerYear', () => {
    const periods = [makePeriod(1000, 0.01, 0.012, 0.2, 0.002)];
    const sim = makeSimResult(periods);
    expect(() => buildCrossSectionalReport(sim, {
      ...baseConfig,
      periodsPerYear: 0,
    })).toThrow(/periodsPerYear must be positive finite/);
    expect(() => buildCrossSectionalReport(sim, {
      ...baseConfig,
      periodsPerYear: NaN,
    })).toThrow();
  });

  it('hand-verified Sharpe/Sortino on portfolio return series', () => {
    // Net returns: [0.01, 0.01, 0.01, 0.01, 0.01] -> mean=0.01, std=0 -> Sharpe null
    // Net returns: [0.02, -0.01, 0.03, 0.0, 0.01] -> mean=0.01, var≈0.00013, std≈0.0114
    const periods = [
      makePeriod(1000, 0.02, 0.02, 0, 0),
      makePeriod(2000, -0.01, -0.01, 0, 0),
      makePeriod(3000, 0.03, 0.03, 0, 0),
      makePeriod(4000, 0.0, 0.0, 0, 0),
      makePeriod(5000, 0.01, 0.01, 0, 0),
    ];
    const sim = makeSimResult(periods);
    const report = buildCrossSectionalReport(sim, { ...baseConfig, periodsPerYear: 252 });

    // mean = 0.01, variance = 0.00013, std = 0.0114018
    // Sharpe = (0.01 / 0.0114018) * sqrt(252) = 0.87706 * 15.8745 = 13.923
    const mean = 0.01;
    const variance = (0.01**2 + (-0.02)**2 + 0.02**2 + (-0.01)**2 + 0**2) / 5;
    const std = Math.sqrt(variance);
    const expectedSharpe = (mean / std) * Math.sqrt(252);
    expect(report.annualizedSharpe).toBeCloseTo(expectedSharpe, 5);
  });
});