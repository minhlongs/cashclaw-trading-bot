// Walk-forward shim for relative-value results.
// ADAPTER, NOT ENGINE: reshapes an RVWalkForwardResult into the
// WalkForwardResult structure consumed by assessWalkForwardConsistency().
//
// ONLY the fields that check actually reads carry real values:
//   - windows[].testMetrics.total_pnl — Σ stitched OOS net returns assigned
//     to the window (a period belongs to the LATEST window whose
//     testStartTime <= period timestamp);
//   - windows[].testMetrics.sharpe_ratio — always null so the check falls
//     back to total_pnl (per-window spans are too short to annualize);
//   - aggregated.summaryStats.degradationRatio — 0: no in-sample RV
//     backtest exists at this seam; the consistency verdict reports but
//     never gates on it.
// Every other BacktestResult field is a documented zero/null placeholder —
// the consistency check never reads them. Pure and deterministic.

import type { BacktestResult } from '@/forest/backtest/types';
import { RegimeLabel } from '@/tree/regime/types';
import type {
  WalkForwardResult,
  WalkForwardWindow,
} from '@/forest/backtest/walkforward';
import type { RVWalkForwardResult } from './walk-forward';

/** Unconsumed BacktestResult shell carrying only the real test PnL. */
function placeholderMetrics(totalPnl: number): BacktestResult {
  return {
    id: '',
    bot_id: '',
    strategy: 'rv_shim',
    pair: 'PAIR',
    exchange: '',
    start_date: 0,
    end_date: 0,
    total_trades: 0,
    win_count: 0,
    loss_count: 0,
    win_rate: 0,
    total_pnl: totalPnl,
    max_drawdown: 0,
    sharpe_ratio: null,
    params_json: '',
    equity_curve_json: [],
    trades_json: [],
    created_at: 0,
  };
}

/** Assign each stitched OOS period to its owning window (latest testStart ≤ ts). */
function bucketOosReturns(rv: RVWalkForwardResult): number[][] {
  if (rv.windows.length === 0) {
    throw new Error('toWalkForwardShim: walk-forward result has no windows');
  }
  const starts = rv.windows.map((w) => w.bounds.testStartTime);
  for (let i = 1; i < starts.length; i++) {
    if (starts[i]! <= starts[i - 1]!) {
      throw new Error('toWalkForwardShim: window test start times must strictly increase');
    }
  }
  const buckets: number[][] = rv.windows.map(() => []);
  for (const period of rv.stitched.roundTripsSource) {
    let assigned = -1;
    for (let i = 0; i < starts.length; i++) {
      if (period.timestamp >= starts[i]!) assigned = i;
      else break;
    }
    if (assigned === -1) {
      throw new Error(
        `toWalkForwardShim: OOS period ${period.timestamp} precedes every window test start`,
      );
    }
    buckets[assigned]!.push(period.netReturn);
  }
  return buckets;
}

/**
 * Reshape an RV walk-forward result into the WalkForwardResult-compatible
 * shim consumed by assessWalkForwardConsistency(). Fails closed on empty
 * windows, non-monotonic test starts, or OOS periods outside every window.
 */
export function toWalkForwardShim(rv: RVWalkForwardResult): WalkForwardResult {
  const buckets = bucketOosReturns(rv);
  const windows: WalkForwardWindow[] = rv.windows.map((w, i) => ({
    trainStart: w.bounds.trainStart,
    trainEnd: w.bounds.trainEnd,
    validateStart: w.bounds.validateStart,
    validateEnd: w.bounds.validateEnd,
    testStart: w.bounds.testStart,
    testEnd: w.bounds.testEnd,
    trainMetrics: placeholderMetrics(0),
    validateMetrics: placeholderMetrics(0),
    testMetrics: placeholderMetrics(
      buckets[i]!.reduce((sum, r) => sum + r, 0),
    ),
    regimeAtTestStart: RegimeLabel.UNKNOWN,
  }));
  return {
    windows,
    aggregated: {
      inSample: placeholderMetrics(0),
      validation: placeholderMetrics(0),
      outOfSample: placeholderMetrics(0),
      byRegime: {} as Record<RegimeLabel, ReturnType<typeof placeholderMetrics>>,
      summaryStats: {
        totalWindows: windows.length,
        avgInSampleSharpe: 0,
        avgOutSampleSharpe: 0,
        degradationRatio: 0,
        regimeDiversity: 0,
      },
    },
  };
}
