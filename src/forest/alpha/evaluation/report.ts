// Alpha Evaluation Report — comprehensive strategy metrics with segmentation
// Generates a full EvaluationReport from extended backtest metrics + candle data.
// Never ranks by raw return alone — all metrics are surfaced together.

import type { Candle } from '@/forest/backtest/ohlcv';
import {
  segmentByRegime,
  segmentByMonth,
  segmentByVolBucket,
  segmentByDuration,
  scalarFieldsFromMetrics,
} from './report-segments';
import type {
  EvaluationReport,
  ExperimentInput,
  VolBucket,
  DurationBuckets,
} from './report-types';

export type {
  EvaluationReport,
  ExperimentInput,
  VolBucket,
  DurationBuckets,
};

// ── Main ─────────────────────────────────────────────────────────────────────

/** Generate a full EvaluationReport from experiment results + candles. */
export function generateReport(
  input: ExperimentInput,
  candles: Candle[],
): EvaluationReport {
  const { experimentId, symbol, timeframe, regime, metrics, costBreakdown } = input;
  const trades = metrics.trades_json;

  return {
    experimentId, symbol, timeframe, regime,
    ...scalarFieldsFromMetrics(metrics, costBreakdown),
    byRegime: segmentByRegime(trades, experimentId, symbol, timeframe, regime),
    byMonth: segmentByMonth(trades, experimentId, symbol, timeframe, regime),
    byVolBucket: segmentByVolBucket(trades, candles, experimentId, symbol, timeframe, regime),
    byDuration: segmentByDuration(trades, experimentId, symbol, timeframe, regime),
  };
}
