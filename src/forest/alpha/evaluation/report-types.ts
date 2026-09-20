// Alpha Evaluation Report — type definitions
// Shared interfaces for the evaluation report pipeline.

import type { RegimeLabel } from '@/tree/regime/types';

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

/** Input payload for generating an evaluation report. */
export interface ExperimentInput {
  experimentId: string;
  symbol: string;
  timeframe: string;
  regime: RegimeLabel;
  metrics: import('@/forest/backtest/metrics-types').ExtendedBacktestMetrics;
  /** Optional cost breakdown (fees/slippage) from applyCosts. */
  costBreakdown?: { fees: number; slippage: number; marketImpact: number } | null;
}
