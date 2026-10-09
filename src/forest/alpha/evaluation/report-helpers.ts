import type { BacktestTrade } from '@/forest/backtest/types';
import type { EvaluationReport } from './report';
import { RegimeLabel } from '@/tree/regime/types';
import { median, computeSortino } from './report-stats';
import { computeMaxDrawdown } from './report-drawdown';

export * from './report-stats';
export * from './report-drawdown';

function emptyPartial(experimentId: string, symbol: string, timeframe: string, regime: RegimeLabel): Partial<EvaluationReport> {
  return {
    experimentId, symbol, timeframe, regime, totalReturn: 0, netPnl: 0, cagr: 0, winRate: 0, lossRate: 0,
    profitFactor: 0, expectancy: 0, sharpe: null, sortino: null, maxDrawdown: 0, avgTrade: 0, medianTrade: 0,
    numTrades: 0, turnover: 0, fees: 0, slippage: 0, exposure: 0, recoveryFactor: 0,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>, byMonth: {}, byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
  };
}

export function reportFromTrades(
  trades: BacktestTrade[], experimentId: string, symbol: string, timeframe: string, regime: RegimeLabel,
): Partial<EvaluationReport> {
  if (trades.length === 0) return emptyPartial(experimentId, symbol, timeframe, regime);
  const pnls = trades.map((t) => t.pnl);
  const wins = pnls.filter((p) => p > 0), losses = pnls.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0), grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const netPnl = pnls.reduce((a, b) => a + b, 0), avgTrade = netPnl / trades.length, maxDD = computeMaxDrawdown(trades);

  return {
    experimentId, symbol, timeframe, regime, totalReturn: netPnl, netPnl, cagr: 0,
    winRate: wins.length / trades.length, lossRate: losses.length / trades.length,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0, expectancy: avgTrade, sharpe: null,
    sortino: computeSortino(pnls), maxDrawdown: maxDD, avgTrade, medianTrade: median(pnls), numTrades: trades.length,
    turnover: 0, fees: 0, slippage: 0, exposure: 0, recoveryFactor: maxDD > 0 ? Math.abs(netPnl / maxDD) : 0,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>, byMonth: {}, byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
  };
}
