// Strategy Survival Gate — mission Phase 15
//
// Automated research gate. A candidate strategy must satisfy configurable
// thresholds to advance from RESEARCH to PAPER_CANDIDATE. Anything that fails
// is KILLED. This gate NEVER promotes to LIVE — that requires explicit manual
// approval outside the pipeline.
//
// Pure function: no I/O, no randomness, no data fetch. Safe to call from tests.

import type { EvaluationReport } from '../evaluation/report';
import {
  checkDrawdown,
  checkExpectancy,
  checkNetPnlAdverse,
  checkNetPnlAfterFees,
  checkProfitFactor,
  checkRegimeCoverage,
  checkSharpe,
  checkTradeCount,
  type GateCheck,
} from './gate-checks';

export type { GateCheck } from './gate-checks';

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
