// Benchmark wiring for pairs research — helpers and metrics aggregations
// Calculates OOS span derivation, span candle slicing, and per-symbol metric averaging.

import type { Candle } from '@/forest/backtest/ohlcv';
import type { BaselineStrategy } from '@/forest/alpha/baselines';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';
import type { BenchmarkComparisonRow, OosSpan } from './benchmarks-types';

/** Derive the inclusive OOS span from stitched periods (fail-closed). */
export function oosSpan(periods: readonly PairPeriodRecord[]): OosSpan {
  if (periods.length === 0) {
    throw new Error('oosSpan: no stitched OOS periods supplied (fail-closed)');
  }
  let start = periods[0]!.timestamp;
  let end = start;
  for (const p of periods) {
    if (p.timestamp < start) start = p.timestamp;
    if (p.timestamp > end) end = p.timestamp;
  }
  return { start, end };
}

/** Candles whose timestamp falls inside the inclusive span. */
export function sliceSpan(candles: readonly Candle[], span: OosSpan): Candle[] {
  return candles.filter(
    (c) => c.timestamp >= span.start && c.timestamp <= span.end,
  );
}

export function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Average one strategy's per-symbol reports into a comparison row. */
export function averageRow(
  strategy: BaselineStrategy,
  reports: readonly EvaluationReport[],
): BenchmarkComparisonRow {
  const sharpes = reports
    .map((r) => r.sharpe)
    .filter((s): s is number => s !== null && Number.isFinite(s));
  return {
    strategy,
    symbols: reports.length,
    expectancy: mean(reports.map((r) => r.expectancy)),
    profitFactor: mean(reports.map((r) => r.profitFactor)),
    sharpe: sharpes.length > 0 ? mean(sharpes) : null,
    maxDrawdown: mean(reports.map((r) => r.maxDrawdown)),
    netPnl: mean(reports.map((r) => r.netPnl)),
    numTrades: reports.reduce((sum, r) => sum + r.numTrades, 0),
  };
}
