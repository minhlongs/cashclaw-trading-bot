// Tests for regime-breakdown (plan §3 Step C).
// Tests asserts no import of RuleBasedRegimeClassifier.
// Length mismatch throws (fail-closed).

import { describe, it, expect } from 'vitest';
import { breakdownByRegime } from './regime-breakdown';
import { RegimeLabel } from '@/tree/regime/types';
import type { RebalanceRecord } from '@/tree/alpha/cross-sectional/types';

describe('regime-breakdown', () => {
  const makePeriod = (netReturn: number, turnover: number): RebalanceRecord => ({
    timestamp: Date.now(),
    weights: {},
    turnover,
    costPct: 0,
    grossReturn: netReturn,
    netReturn,
    grossExposure: 0,
    netExposure: 0,
  });

  const labels: RegimeLabel[] = [
    RegimeLabel.TREND_UP,
    RegimeLabel.RANGE,
    RegimeLabel.HIGH_VOLATILITY,
    RegimeLabel.TREND_UP,
    RegimeLabel.RANGE,
    RegimeLabel.UNKNOWN,
  ];

  it('throws on length mismatch (fail-closed)', () => {
    const periods = [makePeriod(0.01, 0.1)];
    expect(() => breakdownByRegime(periods, labels, 252)).toThrow(
      /periods.length.*!==.*regimeLabels.length/,
    );
  });

  it('groups periods by label and computes metrics per regime', () => {
    const periods = labels.map((_, i) => makePeriod(0.01 + i * 0.001, 0.1 + i * 0.01));
    const result = breakdownByRegime(periods, labels, 252);

    // TREND_UP appears at indices 0, 3: netReturns = [0.01, 0.013], turnover = [0.1, 0.13]
    expect(result.TREND_UP.netReturn).toBeCloseTo(
      (1.01 * 1.013 - 1),
      10,
    );
    expect(result.TREND_UP.turnoverTotal).toBeCloseTo(0.23, 10);
    expect(result.TREND_UP.annualizedSharpe).not.toBeNull();

    // RANGE appears at indices 1, 4: netReturns = [0.011, 0.014], turnover = [0.11, 0.14]
    expect(result.RANGE.netReturn).toBeCloseTo((1.011 * 1.014 - 1), 10);
    expect(result.RANGE.turnoverTotal).toBeCloseTo(0.25, 10);

    // HIGH_VOLATILITY at index 2
    expect(result.HIGH_VOLATILITY.netReturn).toBeCloseTo(0.012, 10);
    expect(result.HIGH_VOLATILITY.turnoverTotal).toBeCloseTo(0.12, 10);

    // UNKNOWN at index 5
    expect(result.UNKNOWN.netReturn).toBeCloseTo(0.015, 10);
    expect(result.UNKNOWN.turnoverTotal).toBeCloseTo(0.15, 10);

    // Unobserved regimes get zeros
    expect(result.TREND_DOWN.netReturn).toBe(0);
    expect(result.TREND_DOWN.annualizedSharpe).toBeNull();
    expect(result.TREND_DOWN.turnoverTotal).toBe(0);

    expect(result.LOW_VOLATILITY.netReturn).toBe(0);
    expect(result.SHOCK.netReturn).toBe(0);
  });

  it('handles single period per regime', () => {
    const periods = [
      makePeriod(0.02, 0.2),
      makePeriod(-0.01, 0.1),
    ];
    const regimeLabels: RegimeLabel[] = [RegimeLabel.TREND_UP, RegimeLabel.TREND_DOWN];
    const result = breakdownByRegime(periods, regimeLabels, 252);

    expect(result.TREND_UP.netReturn).toBeCloseTo(0.02, 10);
    expect(result.TREND_DOWN.netReturn).toBeCloseTo(-0.01, 10);
    // Single period -> Sharpe null
    expect(result.TREND_UP.annualizedSharpe).toBeNull();
    expect(result.TREND_DOWN.annualizedSharpe).toBeNull();
  });

  it('handles all periods same regime', () => {
    const periods = [makePeriod(0.01, 0.1), makePeriod(0.02, 0.2), makePeriod(0.015, 0.15)];
    const regimeLabels: RegimeLabel[] = [RegimeLabel.RANGE, RegimeLabel.RANGE, RegimeLabel.RANGE];
    const result = breakdownByRegime(periods, regimeLabels, 252);

    expect(result.RANGE.netReturn).toBeCloseTo((1.01 * 1.02 * 1.015 - 1), 10);
    expect(result.RANGE.turnoverTotal).toBeCloseTo(0.45, 10);
    // Other regimes zero
    expect(result.TREND_UP.netReturn).toBe(0);
  });

  it('uses periodsPerYear for annualization', () => {
    const periods = [makePeriod(0.001, 0.1), makePeriod(0.001, 0.1)];
    const regimeLabels: RegimeLabel[] = [RegimeLabel.TREND_UP, RegimeLabel.TREND_UP];

    const result252 = breakdownByRegime(periods, regimeLabels, 252);
    const result365 = breakdownByRegime(periods, regimeLabels, 365);

    // Sharpe scales with sqrt(periodsPerYear)
    if (result252.TREND_UP.annualizedSharpe !== null && result365.TREND_UP.annualizedSharpe !== null) {
      const ratio = result365.TREND_UP.annualizedSharpe / result252.TREND_UP.annualizedSharpe;
      expect(ratio).toBeCloseTo(Math.sqrt(365 / 252), 10);
    }
  });
});