// Individual validation checks for Strategy Survival Gate (Phase 15). Pure, deterministic.

import type { EvaluationReport } from '../evaluation/report';

export interface GateCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly actual: number;
  readonly threshold: number;
  readonly detail: string;
}

export function checkTradeCount(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_trades',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `${actual} trades vs. minimum ${threshold}`,
  };
}

export function checkExpectancy(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_expectancy',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Expectancy ${actual.toFixed(4)} vs. minimum ${threshold}`,
  };
}

export function checkProfitFactor(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_profit_factor',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Profit factor ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}

export function checkDrawdown(actual: number, threshold: number): GateCheck {
  return {
    name: 'max_drawdown',
    passed: actual <= threshold,
    actual,
    threshold,
    detail: `Max drawdown ${actual.toFixed(4)} vs. maximum ${threshold}`,
  };
}

export function checkSharpe(actual: number | null, threshold: number): GateCheck {
  const passed = actual !== null && actual >= threshold;
  return {
    name: 'min_sharpe',
    passed,
    actual: actual ?? -Infinity,
    threshold,
    detail: actual === null
      ? 'Sharpe is null (insufficient data) — fails'
      : `Sharpe ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}

export function checkRegimeCoverage(
  byRegime: Record<string, Partial<EvaluationReport>>,
  threshold: number,
): GateCheck {
  const regimes = Object.keys(byRegime).filter(
    (key) => byRegime[key] !== undefined && byRegime[key] !== null,
  );
  // Coverage is the share of observed regimes that produced at least one trade.
  const traded = regimes.filter(
    (key) => (byRegime[key]?.numTrades ?? 0) > 0,
  );
  const coverage = regimes.length === 0 ? 0 : traded.length / regimes.length;
  return {
    name: 'min_regime_coverage',
    passed: coverage >= threshold,
    actual: coverage,
    threshold,
    detail: `${traded.length}/${regimes.length} regimes traded vs. minimum ${(threshold * 100).toFixed(0)}%`,
  };
}

export function checkNetPnlAfterFees(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_net_pnl_after_fees',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Net PnL after NORMAL-stress fees ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}

export function checkNetPnlAdverse(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_net_pnl_adverse',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Net PnL under ADVERSE slippage ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}
