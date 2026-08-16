// Alpha Evaluation Report — comprehensive strategy metrics with segmentation
// Generates a full EvaluationReport from extended backtest metrics + candle data.
// Never ranks by raw return alone — all metrics are surfaced together.

import type { ExtendedBacktestMetrics } from '@/forest/backtest/metrics-types';
import type { BacktestTrade } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { RegimeLabel } from '@/tree/regime/types';
import {
  classifyVol,
  monthKey,
  reportFromTrades,
  durationBucket,
} from './report-helpers';

// ── Types ────────────────────────────────────────────────────────────────────

export type VolBucket = 'low' | 'medium' | 'high';

/** Trade duration bucket based on candle count. */
export interface DurationBuckets {
  short: Partial<EvaluationReport>;
  medium: Partial<EvaluationReport>;
  long: Partial<EvaluationReport>;
}

/** Full evaluation report for a single experiment run. */
export interface EvaluationReport {
  experimentId: string;
  symbol: string;
  timeframe: string;
  regime: RegimeLabel;
  totalReturn: number;
  netPnl: number;
  cagr: number;
  winRate: number;
  lossRate: number;
  profitFactor: number;
  expectancy: number;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number;
  avgTrade: number;
  medianTrade: number;
  numTrades: number;
  turnover: number;
  fees: number;
  slippage: number;
  exposure: number;
  recoveryFactor: number;
  byRegime: Record<RegimeLabel, Partial<EvaluationReport>>;
  byMonth: Record<string, Partial<EvaluationReport>>;
  byVolBucket: Record<string, Partial<EvaluationReport>>;
  byDuration: DurationBuckets;
}

// ── Input ────────────────────────────────────────────────────────────────────

export interface ExperimentInput {
  experimentId: string;
  symbol: string;
  timeframe: string;
  regime: RegimeLabel;
  metrics: ExtendedBacktestMetrics;
}

// ── Main ─────────────────────────────────────────────────────────────────────

/** Generate a full EvaluationReport from experiment results + candles. */
export function generateReport(
  input: ExperimentInput,
  candles: Candle[],
): EvaluationReport {
  const { experimentId, symbol, timeframe, regime, metrics } = input;
  const trades: BacktestTrade[] = metrics.trades_json;

  // Segment by regime
  const byRegime: Record<RegimeLabel, Partial<EvaluationReport>> = {} as Record<
    RegimeLabel, Partial<EvaluationReport>
  >;
  byRegime[regime] = reportFromTrades(trades, experimentId, symbol, timeframe, regime);

  // Segment by month
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

  // Segment by volatility bucket
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

  // Segment by duration
  const dur = durationBucket(trades);
  const byDuration: DurationBuckets = {
    short: reportFromTrades(dur.short, experimentId, symbol, timeframe, regime),
    medium: reportFromTrades(dur.medium, experimentId, symbol, timeframe, regime),
    long: reportFromTrades(dur.long, experimentId, symbol, timeframe, regime),
  };

  return {
    experimentId, symbol, timeframe, regime,
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
    fees: 0, slippage: 0,
    exposure: metrics.exposure_pct,
    recoveryFactor: metrics.recovery_factor,
    byRegime, byMonth,
    byVolBucket: byVolBucket as Record<string, Partial<EvaluationReport>>,
    byDuration,
  };
}
