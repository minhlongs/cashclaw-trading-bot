// Strategy Survival Gate — mission Phase 15
//
// Automated research gate. A candidate strategy must satisfy configurable
// thresholds to advance from RESEARCH to PAPER_CANDIDATE. Anything that fails
// is KILLED. This gate NEVER promotes to LIVE — that requires explicit manual
// approval outside the pipeline.
//
// Pure function: no I/O, no randomness, no data fetch. Safe to call from tests.

import type { EvaluationReport } from '../evaluation/report';

// ── Types ──────────────────────────────────────────────────────────────────────

export type GateStatus = 'PAPER_CANDIDATE' | 'KILLED';

export interface SurvivalGateConfig {
  /** Minimum number of trades before the gate will pass. Default 20. */
  readonly minTrades?: number;
  /** Minimum out-of-sample expectancy required. Default 0. */
  readonly minExpectancy?: number;
  /** Minimum profit factor required. Default 1.2. */
  readonly minProfitFactor?: number;
  /** Maximum acceptable max drawdown (as a fraction, e.g. 0.25 = 25%). Default 0.3. */
  readonly maxDrawdown?: number;
  /** Minimum acceptable Sharpe (null Sharpe always fails). Default 0.5. */
  readonly minSharpe?: number;
  /** Minimum share of regimes the strategy must trade in. Default 0.5 (any 3 of 6+). */
  readonly minRegimeCoverage?: number;
  /** Tolerance for fee-stress: net PnL must stay positive under NORMAL stress. Default 0. */
  readonly minNetPnlAfterFees?: number;
  /** Tolerance for slippage-stress: net PnL must stay positive under ADVERSE stress. Default 0. */
  readonly minNetPnlAdverse?: number;
}

export interface GateCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly actual: number;
  readonly threshold: number;
  readonly detail: string;
}

export interface SurvivalGateResult {
  readonly status: GateStatus;
  readonly reason: string;
  readonly checks: readonly GateCheck[];
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the survival gate over an evaluation report.
 *
 * Returns PAPER_CANDIDATE when every check passes, KILLED otherwise. The gate
 * is a research filter — it does NOT guarantee profitability and NEVER
 * promotes to LIVE.
 */
export function runSurvivalGate(
  report: EvaluationReport,
  config: SurvivalGateConfig = {},
): SurvivalGateResult {
  const minTrades = config.minTrades ?? 20;
  const minExpectancy = config.minExpectancy ?? 0;
  const minProfitFactor = config.minProfitFactor ?? 1.2;
  const maxDrawdown = config.maxDrawdown ?? 0.3;
  const minSharpe = config.minSharpe ?? 0.5;
  const minRegimeCoverage = config.minRegimeCoverage ?? 0.5;
  const minNetPnlAfterFees = config.minNetPnlAfterFees ?? 0;
  const minNetPnlAdverse = config.minNetPnlAdverse ?? 0;

  const checks: GateCheck[] = [];

  checks.push(checkTradeCount(report.numTrades, minTrades));
  checks.push(checkExpectancy(report.expectancy, minExpectancy));
  checks.push(checkProfitFactor(report.profitFactor, minProfitFactor));
  checks.push(checkDrawdown(report.maxDrawdown, maxDrawdown));
  checks.push(checkSharpe(report.sharpe, minSharpe));
  checks.push(checkRegimeCoverage(report.byRegime, minRegimeCoverage));
  checks.push(checkNetPnlAfterFees(report.netPnl, minNetPnlAfterFees));
  // Adverse stress: apply the recorded slippage cost on top of the normal-stress
  // net PnL. The report carries a single netPnl (after normal-stress fees) and a
  // separate slippage field; subtracting it models the adverse scenario without
  // requiring a second report field.
  checks.push(checkNetPnlAdverse(report.netPnl - report.slippage, minNetPnlAdverse));

  const failed = checks.filter((c) => !c.passed);
  if (failed.length === 0) {
    return {
      status: 'PAPER_CANDIDATE',
      reason: `Passed all ${checks.length} checks — eligible for paper shadowing only (never LIVE).`,
      checks,
    };
  }

  return {
    status: 'KILLED',
    reason: `Failed ${failed.length}/${checks.length} checks: ${failed.map((c) => c.name).join(', ')}`,
    checks,
  };
}

// ── Individual checks ──────────────────────────────────────────────────────────

function checkTradeCount(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_trades',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `${actual} trades vs. minimum ${threshold}`,
  };
}

function checkExpectancy(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_expectancy',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Expectancy ${actual.toFixed(4)} vs. minimum ${threshold}`,
  };
}

function checkProfitFactor(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_profit_factor',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Profit factor ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}

function checkDrawdown(actual: number, threshold: number): GateCheck {
  return {
    name: 'max_drawdown',
    passed: actual <= threshold,
    actual,
    threshold,
    detail: `Max drawdown ${actual.toFixed(4)} vs. maximum ${threshold}`,
  };
}

function checkSharpe(actual: number | null, threshold: number): GateCheck {
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

function checkRegimeCoverage(
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

function checkNetPnlAfterFees(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_net_pnl_after_fees',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Net PnL after NORMAL-stress fees ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}

function checkNetPnlAdverse(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_net_pnl_adverse',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Net PnL under ADVERSE slippage ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}