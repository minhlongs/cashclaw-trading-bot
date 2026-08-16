// Backtest Engine — extended metrics types
// Augments BacktestResult with additional performance metrics.

import type { BacktestResult } from './types';

// ──────────────────────────────────────────────
// Extended metrics interface
// ──────────────────────────────────────────────

export interface ExtendedBacktestMetrics extends BacktestResult {
  profit_factor: number;
  expectancy: number;
  sortino_ratio: number | null;
  max_drawdown_duration: number;
  calmar_ratio: number;
  avg_trade: number;
  median_trade: number;
  turnover: number;
  recovery_factor: number;
  exposure_pct: number;
}