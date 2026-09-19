// Walk-forward type definitions.

import type { BacktestResult } from './types';
import type { Candle } from './ohlcv';
import { RegimeLabel } from '@/tree/regime/types';

export interface WindowConfig {
  trainBars: number;
  validateBars: number;
  testBars: number;
  stepBars: number;
}

export type WindowMode = 'rolling' | 'expanding';

export interface WalkForwardWindow {
  trainStart: number;
  trainEnd: number;
  validateStart: number;
  validateEnd: number;
  testStart: number;
  testEnd: number;
  trainMetrics: BacktestResult;
  validateMetrics: BacktestResult;
  testMetrics: BacktestResult;
  regimeAtTestStart: RegimeLabel;
}

export interface SummaryStats {
  totalWindows: number;
  avgInSampleSharpe: number;
  avgOutSampleSharpe: number;
  degradationRatio: number;
  regimeDiversity: number;
}

/** Partial BacktestResult — aggregated metrics omit id/bot_id/strategy/pair/exchange */
export type AggregatedMetrics = Omit<BacktestResult, 'id' | 'bot_id' | 'strategy' | 'pair' | 'exchange'>;

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  aggregated: {
    inSample: AggregatedMetrics;
    validation: AggregatedMetrics;
    outOfSample: AggregatedMetrics;
    byRegime: Record<RegimeLabel, AggregatedMetrics>;
    summaryStats: SummaryStats;
  };
}

/** Run a backtest on a candle slice; caller owns strategy config. */
export type RunBacktestFn = (candles: Candle[]) => BacktestResult;

/** Detect regime at a given candle index. Must be pure. */
export type DetectRegimeFn = (candles: Candle[], index: number) => RegimeLabel;

export interface WindowSlice {
  trainStart: number;
  trainEnd: number;
  validateStart: number;
  validateEnd: number;
  testStart: number;
  testEnd: number;
}
