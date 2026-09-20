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
import type {
  BenchmarkOptions,
  OosSpan,
  BenchmarkComparisonRow,
  BenchmarkComparison,
} from './benchmarks-types';
import {
  oosSpan,
  sliceSpan,
  averageRow,
} from './benchmarks-helpers';

// Re-export types
export type {
  BenchmarkOptions,
  OosSpan,
  BenchmarkComparisonRow,
  BenchmarkComparison,
};

/** Benchmark strategies run on every universe symbol. */
export const BENCHMARK_STRATEGIES: readonly BaselineStrategy[] = [
  'buy_hold',
  'random_entry',
  'simple_momentum',
  'simple_mean_reversion',
];

// Re-export helper
export { oosSpan };

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
