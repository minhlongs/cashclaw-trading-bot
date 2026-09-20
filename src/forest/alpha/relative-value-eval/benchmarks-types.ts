// Benchmark wiring for pairs research — types
// Comparison table shapes and benchmark options.

import type { BaselineStrategy } from '@/forest/alpha/baselines';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { StressMode } from '@/forest/backtest/cost-model';

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
