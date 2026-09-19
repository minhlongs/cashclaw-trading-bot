// Baseline report builder facade — converts BacktestTrade[] into EvaluationReport
import type { BacktestTrade } from '@/forest/backtest/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import { RegimeLabel } from '@/tree/regime/types';
import { median } from '@/forest/alpha/evaluation/report-helpers';
import type { BaselineConfig } from './types';
import { computeTradeStats, buildEquityCurve, computeMaxDD } from './report-builder.stats';
import { aggregateByMonth, aggregateByVolume, aggregateByDuration } from './report-builder.aggregates';

export type { TradeStats, EquityResult } from './report-builder.stats';

// ── Public API ───────────────────────────────────────────────────────────────

export function buildReport(
  trades: BacktestTrade[], cfg: BaselineConfig, totalFees: number,
): EvaluationReport {
  if (trades.length === 0) return emptyReport(cfg);

  const pnls = trades.map((t) => t.pnl);
  const stats = computeTradeStats(pnls, trades.length);
  const maxDD = computeMaxDD(pnls);
  const rf = maxDD > 0 ? Math.abs(stats.cumPnl / maxDD) : 0;
  const { sharpe } = buildEquityCurve(pnls);
  const byMonth = aggregateByMonth(trades);
  const byVol = aggregateByVolume(trades);
  const byDuration = aggregateByDuration(trades);

  return {
    experimentId: `baseline_${cfg.strategy}`, symbol: cfg.symbol, timeframe: cfg.timeframe,
    regime: RegimeLabel.UNKNOWN,
    totalReturn: stats.cumPnl, netPnl: stats.cumPnl, cagr: 0,
    winRate: stats.wins.length / trades.length, lossRate: stats.losses.length / trades.length,
    profitFactor: Number.isFinite(stats.profitFactor) ? stats.profitFactor : 0,
    expectancy: stats.avgPnl,
    sharpe: sharpe || null, sortino: null,
    maxDrawdown: maxDD, avgTrade: stats.avgPnl, medianTrade: median(pnls),
    numTrades: trades.length,
    turnover: 0, fees: totalFees, slippage: totalFees / 2, exposure: 0, recoveryFactor: rf,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth, byVolBucket: byVol, byDuration,
  };
}

export function emptyReport(cfg: BaselineConfig): EvaluationReport {
  return {
    experimentId: `baseline_${cfg.strategy}`, symbol: cfg.symbol, timeframe: cfg.timeframe,
    regime: RegimeLabel.UNKNOWN, totalReturn: 0, netPnl: 0, cagr: 0,
    winRate: 0, lossRate: 0, profitFactor: 0, expectancy: 0,
    sharpe: null, sortino: null, maxDrawdown: 0, avgTrade: 0, medianTrade: 0,
    numTrades: 0, turnover: 0, fees: 0, slippage: 0, exposure: 0, recoveryFactor: 0,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth: {}, byVolBucket: {}, byDuration: { short: {}, medium: {}, long: {} },
  };
}
