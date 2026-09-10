// Composition evaluation types — score → portfolio → report seam.
// Follows the same pattern as cross-sectional-eval and relative-value-eval.

import type { CompositionConfig, ComposedAlpha } from '@/tree/alpha/composition';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio';
import type { StressMode } from '@/tree/alpha/cost-stress';
import type { WindowConfig, WindowMode } from '@/forest/backtest/walkforward';

export interface CompositionEvalConfig {
  readonly compositionConfig: CompositionConfig;
  readonly portfolioConfig: PortfolioConfig;
  readonly experimentId: string;
  readonly timeframe: string;
  readonly periodsPerYear: number;
  readonly costBps?: number;
  readonly stressMode?: StressMode;
}

export interface CompositionPeriodRecord {
  readonly timestamp: number;
  readonly scoredAlphas: readonly { alphaId: string; score: number }[];
  readonly positions: readonly { alphaId: string; weight: number }[];
  readonly grossReturn: number;
  readonly costPct: number;
  readonly netReturn: number;
  readonly turnover: number;
  readonly riskAdjustments: readonly string[];
}

export interface CompositionEvalResult {
  readonly periods: readonly CompositionPeriodRecord[];
  readonly equityCurve: readonly number[];
  readonly totalReturn: number;
  readonly annualizedSharpe: number | null;
  readonly annualizedSortino: number | null;
  readonly maxDrawdownPct: number;
  readonly totalTurnover: number;
  readonly totalCosts: number;
}

export interface CompositionWindowBounds {
  readonly trainStart: number;
  readonly trainEnd: number;
  readonly validateStart: number;
  readonly validateEnd: number;
  readonly testStart: number;
  readonly testEnd: number;
  readonly trainStartTime: number;
  readonly trainEndTime: number;
  readonly testStartTime: number;
  readonly testEndTime: number;
}

export interface CompositionWindowResult {
  readonly windowIndex: number;
  readonly bounds: CompositionWindowBounds;
  readonly trainResult: CompositionEvalResult;
  readonly validateResult: CompositionEvalResult;
  readonly testResult: CompositionEvalResult;
}

export interface CompositionSummaryStats {
  readonly totalWindows: number;
  readonly avgInSampleSharpe: number;
  readonly avgOutSampleSharpe: number;
  readonly degradationRatio: number;
  readonly positiveOosFraction: number;
}

export interface CompositionWalkForwardResult {
  readonly windows: readonly CompositionWindowResult[];
  readonly stitched: CompositionEvalResult;
  readonly summaryStats: CompositionSummaryStats;
}

export interface CompositionWalkForwardInput {
  readonly alphasAtEachT: ReadonlyMap<number, readonly ComposedAlpha[]>;
  readonly returnSeriesAtEachT: ReadonlyMap<number, number>;
  readonly riskInputsAtEachT: ReadonlyMap<number, RiskInputs>;
  readonly config: CompositionEvalConfig;
  readonly windowConfig: WindowConfig;
  readonly mode: WindowMode;
  readonly timestamps?: readonly number[];
}
