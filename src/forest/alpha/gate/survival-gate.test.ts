// survival-gate.test.ts — unit tests for the Strategy Survival Gate (mission Phase 15)
//
// runSurvivalGate is a pure function over an EvaluationReport. Tests cover the
// pass path, the kill path, each individual check, and that the gate never
// promotes to LIVE.

import { describe, it, expect } from 'vitest';
import { RegimeLabel } from '../../../tree/regime/types';
import { runSurvivalGate, type GateStatus } from './survival-gate';
import type { EvaluationReport as Report } from '../evaluation/report';

// ── Test Fixtures ──────────────────────────────────────────────────────────────

function emptyRegimeEntry() {
  return { numTrades: 0, netPnl: 0 };
}

function makeReport(overrides: Partial<Report> = {}): Report {
  const regimes: Report['byRegime'] = {
    [RegimeLabel.TREND_UP]: { numTrades: 30, netPnl: 600 },
    [RegimeLabel.TREND_DOWN]: emptyRegimeEntry(),
    [RegimeLabel.RANGE]: { numTrades: 20, netPnl: 400 },
    [RegimeLabel.HIGH_VOLATILITY]: { numTrades: 15, netPnl: 200 },
    [RegimeLabel.LOW_VOLATILITY]: { numTrades: 10, netPnl: 100 },
    [RegimeLabel.SHOCK]: emptyRegimeEntry(),
    [RegimeLabel.UNKNOWN]: emptyRegimeEntry(),
  };
  return {
    experimentId: 'exp-1',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    regime: RegimeLabel.TREND_UP,
    totalReturn: 0.1,
    netPnl: 1000,
    cagr: 0.15,
    winRate: 0.55,
    lossRate: 0.45,
    profitFactor: 1.8,
    expectancy: 0.5,
    sharpe: 1.2,
    sortino: 1.5,
    maxDrawdown: 0.12,
    avgTrade: 10,
    medianTrade: 8,
    numTrades: 50,
    turnover: 100,
    fees: 50,
    slippage: 20,
    exposure: 0.8,
    recoveryFactor: 3,
    byRegime: regimes,
    byMonth: {},
    byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
    ...overrides,
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('runSurvivalGate', () => {
  it('returns PAPER_CANDIDATE when every check passes', () => {
    const result = runSurvivalGate(makeReport());
    expect(result.status).toBe('PAPER_CANDIDATE');
    expect(result.checks).toHaveLength(8);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('never returns a LIVE status', () => {
    const statuses: GateStatus[] = [];
    statuses.push(runSurvivalGate(makeReport()).status);
    statuses.push(runSurvivalGate(makeReport({ numTrades: 1 })).status);
    for (const s of statuses) {
      expect(s).not.toBe('LIVE');
    }
  });

  it('kills on insufficient trade count', () => {
    const result = runSurvivalGate(makeReport({ numTrades: 5 }));
    expect(result.status).toBe('KILLED');
    const tradeCheck = result.checks.find((c) => c.name === 'min_trades')!;
    expect(tradeCheck.passed).toBe(false);
  });

  it('kills on negative expectancy', () => {
    const result = runSurvivalGate(makeReport({ expectancy: -0.5 }));
    expect(result.status).toBe('KILLED');
    expect(result.checks.find((c) => c.name === 'min_expectancy')!.passed).toBe(false);
  });

  it('kills on profit factor below threshold', () => {
    const result = runSurvivalGate(makeReport({ profitFactor: 0.9 }));
    expect(result.status).toBe('KILLED');
    expect(result.checks.find((c) => c.name === 'min_profit_factor')!.passed).toBe(false);
  });

  it('kills on excessive drawdown', () => {
    const result = runSurvivalGate(makeReport({ maxDrawdown: 0.5 }));
    expect(result.status).toBe('KILLED');
    expect(result.checks.find((c) => c.name === 'max_drawdown')!.passed).toBe(false);
  });

  it('kills when Sharpe is null', () => {
    const result = runSurvivalGate(makeReport({ sharpe: null }));
    expect(result.status).toBe('KILLED');
    const sharpeCheck = result.checks.find((c) => c.name === 'min_sharpe')!;
    expect(sharpeCheck.passed).toBe(false);
    expect(sharpeCheck.actual).toBe(-Infinity);
  });

  it('kills when Sharpe is non-null but below threshold', () => {
    const result = runSurvivalGate(makeReport({ sharpe: 0.3 }));
    expect(result.status).toBe('KILLED');
    const sharpeCheck = result.checks.find((c) => c.name === 'min_sharpe')!;
    expect(sharpeCheck.passed).toBe(false);
    expect(sharpeCheck.actual).toBe(0.3);
  });

  it('passes when Sharpe is exactly at threshold', () => {
    const result = runSurvivalGate(makeReport({ sharpe: 0.5 }));
    const sharpeCheck = result.checks.find((c) => c.name === 'min_sharpe')!;
    expect(sharpeCheck.passed).toBe(true);
  });

  it('kills when regime coverage is too low', () => {
    // All 7 regimes observed, but only 2 produced trades → 29% coverage, below default 0.5.
    const byRegime = makeReport().byRegime;
    byRegime[RegimeLabel.TREND_UP] = { numTrades: 50, netPnl: 600 };
    byRegime[RegimeLabel.RANGE] = { numTrades: 20, netPnl: 400 };
    byRegime[RegimeLabel.TREND_DOWN] = emptyRegimeEntry();
    byRegime[RegimeLabel.HIGH_VOLATILITY] = emptyRegimeEntry();
    byRegime[RegimeLabel.LOW_VOLATILITY] = emptyRegimeEntry();
    byRegime[RegimeLabel.SHOCK] = emptyRegimeEntry();
    byRegime[RegimeLabel.UNKNOWN] = emptyRegimeEntry();
    const result = runSurvivalGate(makeReport({ byRegime }));
    expect(result.status).toBe('KILLED');
    const covCheck = result.checks.find((c) => c.name === 'min_regime_coverage')!;
    expect(covCheck.passed).toBe(false);
    expect(covCheck.actual).toBeCloseTo(2 / 7, 5);
  });

  it('kills on negative net PnL after fees', () => {
    const result = runSurvivalGate(makeReport({ netPnl: -100 }));
    expect(result.status).toBe('KILLED');
    expect(result.checks.find((c) => c.name === 'min_net_pnl_after_fees')!.passed).toBe(false);
  });

  it('kills when adverse slippage stress pushes net PnL below threshold', () => {
    // Net PnL is positive after normal-stress fees, but recorded slippage is
    // larger than the profit → adverse-stress PnL is negative → fails.
    const result = runSurvivalGate(makeReport({ netPnl: 10, slippage: 20 }));
    expect(result.status).toBe('KILLED');
    const afterFees = result.checks.find((c) => c.name === 'min_net_pnl_after_fees')!;
    const adverse = result.checks.find((c) => c.name === 'min_net_pnl_adverse')!;
    expect(afterFees.passed).toBe(true);
    expect(adverse.passed).toBe(false);
    expect(adverse.actual).toBe(-10);
  });

  it('adverse check can be tuned independently of the normal-stress check', () => {
    // netPnl 10, slippage 20 → adverse = -10. Tightening the adverse threshold
    // to -20 lets it pass while the normal-stress check still passes.
    const result = runSurvivalGate(
      makeReport({ netPnl: 10, slippage: 20 }),
      { minNetPnlAdverse: -20 },
    );
    expect(result.status).toBe('PAPER_CANDIDATE');
    expect(result.checks.find((c) => c.name === 'min_net_pnl_adverse')!.passed).toBe(true);
  });

  it('applies custom thresholds', () => {
    // Tighten trade count so the passing report now fails.
    const result = runSurvivalGate(makeReport({ numTrades: 50 }), { minTrades: 200 });
    expect(result.status).toBe('KILLED');
    expect(result.checks.find((c) => c.name === 'min_trades')!.threshold).toBe(200);
  });

  it('kills when only one of seven observed regimes trades', () => {
    const byRegime = makeReport().byRegime;
    byRegime[RegimeLabel.TREND_UP] = { numTrades: 50, netPnl: 600 };
    byRegime[RegimeLabel.TREND_DOWN] = emptyRegimeEntry();
    byRegime[RegimeLabel.RANGE] = emptyRegimeEntry();
    byRegime[RegimeLabel.HIGH_VOLATILITY] = emptyRegimeEntry();
    byRegime[RegimeLabel.LOW_VOLATILITY] = emptyRegimeEntry();
    byRegime[RegimeLabel.SHOCK] = emptyRegimeEntry();
    byRegime[RegimeLabel.UNKNOWN] = emptyRegimeEntry();
    const result = runSurvivalGate(makeReport({ byRegime }));
    const covCheck = result.checks.find((c) => c.name === 'min_regime_coverage')!;
    expect(covCheck.passed).toBe(false);
    expect(covCheck.actual).toBeCloseTo(1 / 7, 5);
  });

  it('passes when most observed regimes trade', () => {
    // 5 of 7 regimes trade → 71% coverage, above default 0.5.
    const byRegime = makeReport().byRegime;
    for (const regime of [
      RegimeLabel.TREND_UP,
      RegimeLabel.TREND_DOWN,
      RegimeLabel.RANGE,
      RegimeLabel.HIGH_VOLATILITY,
      RegimeLabel.LOW_VOLATILITY,
    ]) {
      byRegime[regime] = { numTrades: 10, netPnl: 100 };
    }
    const result = runSurvivalGate(makeReport({ byRegime }));
    const covCheck = result.checks.find((c) => c.name === 'min_regime_coverage')!;
    expect(covCheck.passed).toBe(true);
    expect(covCheck.actual).toBeCloseTo(5 / 7, 5);
  });

  it('kills when no regimes are observed at all', () => {
    const result = runSurvivalGate(makeReport({ byRegime: {} as Record<RegimeLabel, Partial<Report>> }));
    expect(result.status).toBe('KILLED');
    const covCheck = result.checks.find((c) => c.name === 'min_regime_coverage')!;
    expect(covCheck.passed).toBe(false);
    expect(covCheck.actual).toBe(0);
  });

  it('reports the failing check names in the reason', () => {
    const result = runSurvivalGate(makeReport({ numTrades: 1, expectancy: -1 }));
    expect(result.status).toBe('KILLED');
    expect(result.reason).toContain('min_trades');
    expect(result.reason).toContain('min_expectancy');
  });
});