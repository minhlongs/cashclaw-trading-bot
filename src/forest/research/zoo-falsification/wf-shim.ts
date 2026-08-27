// Minimal WalkForwardResult builder (Phase 3, D5). The IC study has no
// real backtest engine behind it, so `assessWalkForwardConsistency`
// consumes a deterministic 6-window shim: each window's test metric is the
// mean IC of one non-overlapping chunk (documented as the ONLY metric the
// consistency check reads). `degradationRatio: 1` is NEUTRAL and is read by
// the check but never influences the boolean — it is disclosed in report
// meta so the value is never mistaken for a fabricated OOS/IS measurement.
// Pure: no I/O, no randomness.

import type { BacktestEquityPoint, BacktestResult, BacktestTrade } from '@/forest/backtest/types';
import type { WalkForwardResult } from '@/forest/backtest/walkforward';
import { RegimeLabel } from '@/tree/regime/types';

/** Empty trade/equity arrays — the shim carries no trade-level data. */
const EMPTY_TRADES: BacktestTrade[] = [];
const EMPTY_EQUITY: BacktestEquityPoint[] = [];

/** Minimal BacktestResult carrying only the fields the consistency check reads. */
function metricResult(
  id: string,
  botId: string,
  strategy: string,
  pair: string,
  exchange: string,
  startDate: number,
  endDate: number,
  totalTrades: number,
  pnl: number,
  sharpe: number | null,
): BacktestResult {
  return {
    id,
    bot_id: botId,
    strategy,
    pair,
    exchange,
    start_date: startDate,
    end_date: endDate,
    total_trades: totalTrades,
    win_count: 0,
    loss_count: 0,
    win_rate: 0,
    total_pnl: pnl,
    max_drawdown: 0,
    sharpe_ratio: sharpe,
    params_json: '{}',
    equity_curve_json: EMPTY_EQUITY,
    trades_json: EMPTY_TRADES,
    created_at: startDate,
  };
}

/** All regime labels mapped to a zeroed metric result (Record completeness). */
function byRegimeResults(botId: string): Record<RegimeLabel, BacktestResult> {
  const labels = Object.values(RegimeLabel);
  const out = {} as Record<RegimeLabel, BacktestResult>;
  for (const label of labels) {
    out[label] = metricResult(`wf-agg-regime-${label}`, botId, 'zoo-ic', 'shim', 'paper', 0, 6, 0, 0, null);
  }
  return out;
}

/**
 * Build a 6-window WalkForwardResult from IC-mean chunks.
 *
 * - `chunks` must have exactly 6 entries (the IC study splits the valid IC
 *   series into 6 non-overlapping windows by construction).
 * - Each chunk's mean becomes `testMetrics.total_pnl` (the fallback metric
 *   `assessWalkForwardConsistency` uses when `sharpe_ratio` is null).
 * - `degradationRatio: 1` is neutral; the consistency boolean depends only
 *   on positiveFraction / signFlips.
 */
export function buildIcWalkForwardShim(
  chunks: readonly (number | null)[],
  botId: 'zoo-ic-shim',
): WalkForwardResult {
  if (chunks.length !== 6) {
    throw new Error(`buildIcWalkForwardShim requires exactly 6 chunks, got ${chunks.length}`);
  }
  const windows = chunks.map((mean, i) => {
    const start = i;
    const end = i + 1;
    const pnl = mean === null ? 0 : mean;
    return {
      trainStart: start,
      trainEnd: start,
      validateStart: start,
      validateEnd: start,
      testStart: start,
      testEnd: end,
      trainMetrics: metricResult(`wf-train-${i}`, botId, 'zoo-ic', 'shim', 'paper', start, end, 0, 0, null),
      validateMetrics: metricResult(`wf-val-${i}`, botId, 'zoo-ic', 'shim', 'paper', start, end, 0, 0, null),
      testMetrics: metricResult(`wf-test-${i}`, botId, 'zoo-ic', 'shim', 'paper', start, end, 0, pnl, null),
      regimeAtTestStart: RegimeLabel.UNKNOWN,
    };
  });

  const aggregated = {
    inSample: metricResult('wf-agg-is', botId, 'zoo-ic', 'shim', 'paper', 0, 6, 0, 0, null),
    validation: metricResult('wf-agg-val', botId, 'zoo-ic', 'shim', 'paper', 0, 6, 0, 0, null),
    outOfSample: metricResult('wf-agg-oos', botId, 'zoo-ic', 'shim', 'paper', 0, 6, 0, 0, null),
    byRegime: byRegimeResults(botId),
    summaryStats: {
      totalWindows: 6,
      avgInSampleSharpe: 0,
      avgOutSampleSharpe: 0,
      degradationRatio: 1,
      regimeDiversity: 1,
    },
  };

  return { windows, aggregated };
}