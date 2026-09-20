// Alpha Evaluation Report — segmentation logic
// Builds the byRegime / byMonth / byVolBucket / byDuration segments.

import type { ExtendedBacktestMetrics } from '@/forest/backtest/metrics-types';
import type { BacktestTrade } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { RegimeLabel } from '@/tree/regime/types';
import type { DurationBuckets, EvaluationReport } from './report-types';
import {
  classifyVol,
  monthKey,
  reportFromTrades,
  durationBucket,
} from './report-helpers';

/** Build the byRegime segment (single regime for the run). */
export function segmentByRegime(
  trades: BacktestTrade[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): Record<RegimeLabel, Partial<EvaluationReport>> {
  const byRegime: Record<RegimeLabel, Partial<EvaluationReport>> = {} as Record<
    RegimeLabel, Partial<EvaluationReport>
  >;
  byRegime[regime] = reportFromTrades(trades, experimentId, symbol, timeframe, regime);
  return byRegime;
}

/** Build the byMonth segment from trade timestamps. */
export function segmentByMonth(
  trades: BacktestTrade[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): Record<string, Partial<EvaluationReport>> {
  const monthMap = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    const key = monthKey(t.entryTimestamp);
    const arr = monthMap.get(key) ?? [];
    arr.push(t);
    monthMap.set(key, arr);
  }
  const byMonth: Record<string, Partial<EvaluationReport>> = {};
  for (const [m, mTrades] of monthMap) {
    byMonth[m] = reportFromTrades(mTrades, experimentId, symbol, timeframe, regime);
  }
  return byMonth;
}

/** Build the byVolBucket segment using per-candle volatility classification. */
export function segmentByVolBucket(
  trades: BacktestTrade[],
  candles: Candle[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): Record<string, Partial<EvaluationReport>> {
  const volBuckets = classifyVol(candles);
  const volMap = new Map<string, BacktestTrade[]>();
  for (let i = 0; i < trades.length; i++) {
    const bucket = volBuckets[Math.min(i, volBuckets.length - 1)];
    const arr = volMap.get(bucket) ?? [];
    arr.push(trades[i]);
    volMap.set(bucket, arr);
  }
  const byVolBucket: Record<string, Partial<EvaluationReport>> = {};
  for (const [b, bTrades] of volMap) {
    byVolBucket[b] = reportFromTrades(bTrades, experimentId, symbol, timeframe, regime);
  }
  return byVolBucket;
}

/** Build the byDuration segment from trade holding periods. */
export function segmentByDuration(
  trades: BacktestTrade[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): DurationBuckets {
  const dur = durationBucket(trades);
  return {
    short: reportFromTrades(dur.short, experimentId, symbol, timeframe, regime),
    medium: reportFromTrades(dur.medium, experimentId, symbol, timeframe, regime),
    long: reportFromTrades(dur.long, experimentId, symbol, timeframe, regime),
  };
}

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
