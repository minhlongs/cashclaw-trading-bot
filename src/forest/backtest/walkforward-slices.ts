// Walk-forward slice computation and result aggregation helpers.

import type { BacktestResult } from './types';
import type {
  WindowConfig,
  WindowMode,
  WindowSlice,
  AggregatedMetrics,
} from './walkforward-types';

export function averageResults(results: BacktestResult[]): AggregatedMetrics {
  if (results.length === 0) throw new Error('Cannot average empty results');
  const n = results.length;
  const pick = (k: keyof BacktestResult): number =>
    results.reduce((a, r) => a + (Number(r[k]) || 0), 0) / n;
  const pickNull = (k: keyof BacktestResult): number | null => {
    const vals = results.map(r => r[k] as number | null).filter(v => v !== null);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const first = results[0]!;
  const last = results[results.length - 1]!;
  return {
    start_date: first.start_date,
    end_date: last.end_date,
    total_trades: Math.round(pick('total_trades')),
    win_count: Math.round(pick('win_count')),
    loss_count: Math.round(pick('loss_count')),
    win_rate: Number(pick('win_rate').toFixed(4)),
    total_pnl: Number(pick('total_pnl').toFixed(2)),
    max_drawdown: Number(pick('max_drawdown').toFixed(2)),
    sharpe_ratio: pickNull('sharpe_ratio'),
    params_json: first.params_json,
    equity_curve_json: [],
    trades_json: [],
    created_at: Date.now(),
  } as AggregatedMetrics;
}

/** Exported additively for relative-value walk-forward planning (same semantics). */
export function computeSlices(totalBars: number, cfg: WindowConfig, mode: WindowMode): WindowSlice[] {
  const minBars = cfg.trainBars + cfg.validateBars + cfg.testBars;
  if (totalBars < minBars) {
    throw new Error(`Not enough candles: ${totalBars} < ${minBars} (train+validate+test)`);
  }
  if (cfg.stepBars <= 0) throw new Error('stepBars must be > 0');

  const slices: WindowSlice[] = [];
  let offset = 0;
  while (true) {
    const trainStart = mode === 'expanding' ? 0 : offset;
    const trainEnd = offset + cfg.trainBars;
    const validateStart = trainEnd;
    const validateEnd = validateStart + cfg.validateBars;
    const testStart = validateEnd;
    const testEnd = testStart + cfg.testBars;
    if (testEnd > totalBars) break;
    slices.push({ trainStart, trainEnd, validateStart, validateEnd, testStart, testEnd });
    offset += cfg.stepBars;
  }
  return slices;
}
