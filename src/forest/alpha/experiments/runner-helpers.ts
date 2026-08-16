// Experiment Engine — Runner Helpers
// Pure functions extracted to keep runner.ts under 200 lines.

import type { PeriodMetrics, RegimePerformance, RegimePerformanceEntry, SymbolPerformance, SymbolPerformanceEntry } from './types';
import type { BacktestResult } from '@/forest/backtest/types';
import { RegimeLabel } from '@/tree/regime/types';

/** Derive PeriodMetrics from a BacktestResult. */
export function metricsFromBacktest(bt: BacktestResult): PeriodMetrics {
  return {
    sharpe: bt.sharpe_ratio,
    totalPnl: bt.total_pnl,
    tradeCount: bt.total_trades,
    winRate: bt.win_rate,
    maxDrawdown: bt.max_drawdown,
  };
}

/** Compute per-regime performance from backtest trades. */
export function computeRegimePerformance(
  bt: BacktestResult,
  classifyRegime: (candles: unknown[], index: number) => RegimeLabel,
  candles: unknown[],
): RegimePerformance {
  const buckets: Partial<Record<RegimeLabel, { pnl: number; wins: number; count: number }>> = {};

  for (const trade of bt.trades_json) {
    const regime = classifyRegime(candles, trade.entryTimestamp);
    const bucket = buckets[regime] ?? { pnl: 0, wins: 0, count: 0 };
    bucket.pnl += trade.pnl;
    bucket.count += 1;
    if (trade.pnl > 0) bucket.wins += 1;
    buckets[regime] = bucket;
  }

  const result: Partial<RegimePerformance> = {};
  for (const [label, data] of Object.entries(buckets)) {
    const regime = label as RegimeLabel;
    result[regime] = {
      regime,
      sampleCount: data.count,
      sharpe: null,
      totalPnl: data.pnl,
      winRate: data.count > 0 ? data.wins / data.count : 0,
    };
  }
  return result as RegimePerformance;
}

/** Compute per-symbol performance — single-symbol engine. */
export function computeSymbolPerformance(bt: BacktestResult, symbol: string): SymbolPerformance {
  const entry: SymbolPerformanceEntry = {
    symbol,
    tradeCount: bt.total_trades,
    sharpe: bt.sharpe_ratio,
    totalPnl: bt.total_pnl,
    maxDrawdown: bt.max_drawdown,
  };
  return { [symbol]: entry };
}

/** Produce an empty BacktestResult for failure paths. */
export function emptyBacktest(): BacktestResult {
  return {
    id: '',
    bot_id: '',
    strategy: '',
    pair: '',
    exchange: '',
    start_date: 0,
    end_date: 0,
    total_trades: 0,
    win_count: 0,
    loss_count: 0,
    win_rate: 0,
    total_pnl: 0,
    max_drawdown: 0,
    sharpe_ratio: null,
    params_json: '{}',
    equity_curve_json: [],
    trades_json: [],
    created_at: Date.now(),
  };
}