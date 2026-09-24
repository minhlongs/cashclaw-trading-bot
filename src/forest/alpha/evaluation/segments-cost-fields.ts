// Alpha Evaluation Report — Cost field resolution & scalar field mapping
// Resolves the cost breakdown fields from metrics and maps raw metrics
// into the top-level scalar report fields.

import type { ExtendedBacktestMetrics } from '@/forest/backtest/metrics-types';
import type { EvaluationReport } from './report-types';

/** Resolve the cost breakdown fields from metrics (placeholder for future wiring). */
export function resolveCostFields(
  costBreakdown: { fees: number; slippage: number; marketImpact: number } | null | undefined,
): { fees: number; slippage: number } {
  return {
    fees: costBreakdown?.fees ?? 0,
    slippage: costBreakdown?.slippage ?? 0,
  };
}

/** Map raw metrics into the top-level scalar report fields. */
export function scalarFieldsFromMetrics(
  metrics: ExtendedBacktestMetrics,
  costBreakdown: { fees: number; slippage: number; marketImpact: number } | null | undefined,
): Pick<
  EvaluationReport,
  | 'totalReturn' | 'netPnl' | 'cagr' | 'winRate' | 'lossRate'
  | 'profitFactor' | 'expectancy' | 'sharpe' | 'sortino'
  | 'maxDrawdown' | 'avgTrade' | 'medianTrade' | 'numTrades'
  | 'turnover' | 'fees' | 'slippage' | 'exposure' | 'recoveryFactor'
> {
  const costs = resolveCostFields(costBreakdown);
  return {
    totalReturn: metrics.total_pnl,
    netPnl: metrics.total_pnl,
    cagr: 0,
    winRate: metrics.win_rate,
    lossRate: 1 - metrics.win_rate,
    profitFactor: metrics.profit_factor,
    expectancy: metrics.expectancy,
    sharpe: metrics.sharpe_ratio,
    sortino: metrics.sortino_ratio,
    maxDrawdown: metrics.max_drawdown,
    avgTrade: metrics.avg_trade,
    medianTrade: metrics.median_trade,
    numTrades: metrics.total_trades,
    turnover: metrics.turnover,
    fees: costs.fees,
    slippage: costs.slippage,
    exposure: metrics.exposure_pct,
    recoveryFactor: metrics.recovery_factor,
  };
}
