// Evaluation Report — helper functions
// Pure computation helpers for building evaluation report segments.

import type { BacktestTrade } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { EvaluationReport, VolBucket } from './report';
import { RegimeLabel } from '@/tree/regime/types';

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function classifyVol(
  candles: Candle[],
  thresholds: { low: number; high: number } = { low: 0.01, high: 0.03 },
): VolBucket[] {
  if (candles.length < 2) return candles.map(() => 'medium' as VolBucket);
  return candles.map((c) => {
    const range = (c.high - c.low) / (c.close || 1);
    if (range < thresholds.low) return 'low' as VolBucket;
    if (range > thresholds.high) return 'high' as VolBucket;
    return 'medium' as VolBucket;
  });
}

export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function computeSortino(pnls: number[]): number | null {
  if (pnls.length < 2) return null;
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const downsideVar = pnls
    .filter((p) => p < 0)
    .reduce((a, p) => a + p ** 2, 0) / pnls.length;
  const downsideStd = Math.sqrt(downsideVar);
  return downsideStd === 0 ? null : mean / downsideStd;
}

export function computeMaxDrawdown(trades: BacktestTrade[]): number {
  let peak = 0;
  let cumPnl = 0;
  let maxDD = 0;
  for (const t of trades) {
    cumPnl += t.pnl;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function durationBucket(trades: BacktestTrade[]): {
  short: BacktestTrade[];
  medium: BacktestTrade[];
  long: BacktestTrade[];
} {
  if (trades.length < 10) return { short: trades, medium: [], long: [] };
  if (trades.length < 50) return { short: trades.slice(0, 10), medium: trades.slice(10), long: [] };
  return {
    short: trades.slice(0, 10),
    medium: trades.slice(10, 50),
    long: trades.slice(50),
  };
}

/** Build a partial report from a subset of trades. */
export function reportFromTrades(
  trades: BacktestTrade[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): Partial<EvaluationReport> {
  if (trades.length === 0) {
    return emptyPartial(experimentId, symbol, timeframe, regime);
  }

  const pnls = trades.map((t) => t.pnl);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const avgTrade = netPnl / trades.length;

  return {
    experimentId, symbol, timeframe, regime,
    totalReturn: netPnl, netPnl, cagr: 0,
    winRate: wins.length / trades.length,
    lossRate: losses.length / trades.length,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0,
    expectancy: avgTrade, sharpe: null,
    sortino: computeSortino(pnls),
    maxDrawdown: computeMaxDrawdown(trades),
    avgTrade, medianTrade: median(pnls), numTrades: trades.length,
    turnover: 0, fees: 0, slippage: 0, exposure: 0,
    recoveryFactor: computeMaxDrawdown(trades) > 0
      ? Math.abs(netPnl / computeMaxDrawdown(trades)) : 0,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth: {}, byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
  };
}

function emptyPartial(
  experimentId: string, symbol: string, timeframe: string, regime: RegimeLabel,
): Partial<EvaluationReport> {
  return {
    experimentId, symbol, timeframe, regime,
    totalReturn: 0, netPnl: 0, cagr: 0, winRate: 0, lossRate: 0,
    profitFactor: 0, expectancy: 0, sharpe: null, sortino: null,
    maxDrawdown: 0, avgTrade: 0, medianTrade: 0, numTrades: 0,
    turnover: 0, fees: 0, slippage: 0, exposure: 0, recoveryFactor: 0,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth: {}, byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
  };
}
