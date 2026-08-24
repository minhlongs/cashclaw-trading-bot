// Composition evaluation types — score → portfolio → report seam.
// Follows the same pattern as cross-sectional-eval and relative-value-eval.

import type { CompositionConfig } from '@/tree/alpha/composition';
import type { PortfolioConfig } from '@/tree/alpha/portfolio';
import type { StressMode } from '@/tree/alpha/cost-stress';

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
