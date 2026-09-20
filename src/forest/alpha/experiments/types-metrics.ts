// Experiment Engine — Performance Metrics Types

import type { RegimeLabel } from '@/tree/regime/types';

/** Metrics computed for a single regime bucket. */
export interface RegimePerformanceEntry {
  regime: RegimeLabel;
  sampleCount: number;
  sharpe: number | null;
  totalPnl: number;
  winRate: number;
}

/** Map from regime label to performance. */
export type RegimePerformance = Record<RegimeLabel, RegimePerformanceEntry>;

/** Metrics for a single symbol within an experiment. */
export interface SymbolPerformanceEntry {
  symbol: string;
  tradeCount: number;
  sharpe: number | null;
  totalPnl: number;
  maxDrawdown: number;
}

/** Map from symbol to performance. */
export type SymbolPerformance = Record<string, SymbolPerformanceEntry>;

/** Standard period metrics used for train / validation / test. */
export interface PeriodMetrics {
  sharpe: number | null;
  totalPnl: number;
  tradeCount: number;
  winRate: number;
  maxDrawdown: number;
}
