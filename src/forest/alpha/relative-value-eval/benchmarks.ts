// Benchmark wiring for pairs research.
// ADAPTER, NOT ENGINE: runs the existing runBaseline() benchmark strategies
// on EACH universe symbol over the IDENTICAL stitched OOS span, then
// averages the per-symbol reports into one comparison row per strategy.
//
// Unit note: runBaseline() reports are PRICE-UNIT (pnl in price units,
// equity anchored at 1000) while the RV strategy report is
// portfolio-fraction. Each side of the comparison table stays in its own
// units — the comparison is directional, never a numeric subtraction.
// Pure and deterministic (random_entry is internally seeded).

import type { Candle } from '@/forest/backtest/ohlcv';
import { runBaseline, type BaselineStrategy } from '@/forest/alpha/baselines';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';

/** Benchmark strategies run on every universe symbol. */
export const BENCHMARK_STRATEGIES: readonly BaselineStrategy[] = [
  'buy_hold',
  'random_entry',
  'simple_momentum',
  'simple_mean_reversion',
];

/** Cost + identity options shared by every benchmark run. */
export interface BenchmarkOptions {
  readonly timeframe: string;
  readonly stressMode: StressMode;
  readonly feePct: number;
  readonly slipPct: number;
}

/** Inclusive timestamp span of the stitched OOS periods. */
export interface OosSpan {
  readonly start: number;
  readonly end: number;
}

/** One averaged comparison row per benchmark strategy. */
export interface BenchmarkComparisonRow {
  readonly strategy: BaselineStrategy;
  readonly symbols: number;
  readonly expectancy: number;
  readonly profitFactor: number;
  readonly sharpe: number | null;
  readonly maxDrawdown: number;
  readonly netPnl: number;
  readonly numTrades: number;
}

/** Full comparison: averaged rows + raw per-symbol reports. */
export interface BenchmarkComparison {
  readonly rows: BenchmarkComparisonRow[];
  readonly perSymbol: Readonly<
    Record<BaselineStrategy, readonly EvaluationReport[]>
  >;
}

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
function sliceSpan(candles: readonly Candle[], span: OosSpan): Candle[] {
  return candles.filter(
    (c) => c.timestamp >= span.start && c.timestamp <= span.end,
  );
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Average one strategy's per-symbol reports into a comparison row. */
function averageRow(
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

/**
 * Run every benchmark strategy on each universe symbol over the identical
 * stitched OOS span and average into comparison rows. Fail-closed: throws
 * on an empty universe or on any symbol with fewer than 2 candles inside
 * the span (a benchmark over a degenerate span would silently mislead).
 */
export function runBenchmarks(
  candlesBySymbol: Readonly<Record<string, readonly Candle[]>>,
  span: OosSpan,
  options: BenchmarkOptions,
): BenchmarkComparison {
  const symbols = Object.keys(candlesBySymbol);
  if (symbols.length === 0) {
    throw new Error('runBenchmarks: empty universe (fail-closed)');
  }
  const perSymbol = {} as Record<BaselineStrategy, EvaluationReport[]>;
  for (const strategy of BENCHMARK_STRATEGIES) perSymbol[strategy] = [];
  for (const symbol of symbols) {
    const slice = sliceSpan(candlesBySymbol[symbol] ?? [], span);
    if (slice.length < 2) {
      throw new Error(
        `runBenchmarks: symbol ${symbol} has ${slice.length} candles inside the OOS span (need ≥2)`,
      );
    }
    for (const strategy of BENCHMARK_STRATEGIES) {
      perSymbol[strategy]!.push(
        runBaseline(slice, {
          strategy,
          symbol,
          timeframe: options.timeframe,
          stressMode: options.stressMode,
          feePct: options.feePct,
          slipPct: options.slipPct,
        }),
      );
    }
  }
  return {
    rows: BENCHMARK_STRATEGIES.map((s) => averageRow(s, perSymbol[s]!)),
    perSymbol,
  };
}
