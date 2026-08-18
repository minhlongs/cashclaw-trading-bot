// Alpha Research Pipeline — Types
// Orchestrator types for the end-to-end alpha research pipeline.

import type { Candle } from '@/forest/backtest/ohlcv';
import type { RegimeConfig, RegimeLabel } from '@/tree/regime/types';
import type { WindowConfig } from '@/forest/backtest/walkforward';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { RegimeResult } from '@/tree/regime/types';
import type { DerivativeSignal } from '@/tree/alpha/signals';
import type { AttributionResult } from '@/forest/alpha/attribution/types';
import type { BaselineConfig } from '@/forest/alpha/baselines/types';

// ── Pipeline Configuration ──────────────────────────────────────────────────

/** Configuration for a full alpha research pipeline run. */
export interface PipelineConfig {
  /** Trading pair symbol (e.g. 'BTCUSDT'). */
  symbol: string;
  /** Candle timeframe (e.g. '1h', '4h', '1d'). */
  timeframe: string;
  /** Pre-fetched OHLCV candle data. */
  candles: Candle[];
  /**
   * Optional pre-fetched derivative data.
   * When set, `fetch_derivatives` uses it directly instead of calling Binance.
   * Lets tests exercise the derivative alpha path deterministically offline.
   * When unset, the step fetches live data and degrades to empty on network failure.
   */
  derivatives?: DerivativeData;
  /** Indicator computation parameters (keyed by indicator name). */
  indicatorSet: Record<string, number>;
  /** Regime classifier configuration. */
  regimeConfig: RegimeConfig;
  /** Walk-forward window configuration. */
  walkforwardConfig: WindowConfig;
  /** Cost stress mode for evaluation. */
  costMode: StressMode;
  /** Minimum Sharpe ratio to pass the pipeline. */
  minSharpe: number;
  /** Minimum trade count to pass the pipeline. */
  minTrades: number;
  /** Whether to run baseline strategy comparisons. */
  baselinesEnabled: boolean;
}

// ── Pipeline Steps ──────────────────────────────────────────────────────────

export type PipelineStep =
  | 'fetch_data'
  | 'fetch_derivatives'
  | 'compute_indicators'
  | 'detect_regimes'
  | 'generate_signals'
  | 'label_events'
  | 'run_walkforward'
  | 'compute_costs'
  | 'evaluate'
  | 'attribute'
  | 'compare_baselines'
  | 'generate_report';

// ── Pipeline Result ─────────────────────────────────────────────────────────

/** Outcome of a single pipeline step. */
export interface PipelineStepResult {
  step: PipelineStep;
  status: 'success' | 'skipped' | 'error';
  data: unknown;
  duration: number;
  error?: string;
}

// ── Step Data Contracts ─────────────────────────────────────────────────────

/** Data produced by the compute_indicators step. */
export interface IndicatorData {
  features: Record<string, number>[];
  names: string[];
}

/** Data produced by the fetch_derivatives step (non-TA market-structure signals). */
export interface DerivativeData {
  features: import('@/tree/alpha/signals').DerivativeFeatures[];
  signals: import('@/tree/alpha/signals').DerivativeSignal[];
}

/** Data produced by the detect_regimes step. */
export interface RegimeData {
  regimes: RegimeResult[];
  history: RegimeResult[];
}

/** Data produced by the generate_signals step. */
export interface SignalData {
  signals: AlphaSignal[];
}

/** Data produced by the label_events step. */
export interface EventData {
  labels: ('buy' | 'sell' | 'hold')[];
}

/** Data produced by run_walkforward step. */
export interface WalkforwardData {
  sharpe: number;
  totalTrades: number;
  passed: boolean;
  result: unknown;
}

/** Data produced by compute_costs step. */
export interface CostData {
  grossPnl: number;
  netPnl: number;
  fees: number;
}

/** Data produced by evaluate step. */
export interface EvalData {
  report: EvaluationReport;
}

/** Data produced by attribute step. */
export interface AttributeData {
  attributions: AttributionResult[];
}

/** Data produced by compare_baselines step. */
export interface BaselineData {
  baselines: BaselineConfig[];
  reports: Record<string, EvaluationReport>;
}

// ── Final Report ────────────────────────────────────────────────────────────

/** Regime-level performance breakdown for the final report. */
export interface RegimeBreakdownEntry {
  trades: number;
  winRate: number;
}

/** Top contributing feature. */
export interface TopFeature {
  name: string;
  importance: number;
}

/** Final pipeline recommendation. */
export type PipelineRecommendation = 'deploy' | 'refine' | 'discard';

/** Final alpha research report produced by the pipeline. */
export interface AlphaResearchReport {
  symbol: string;
  timeframe: string;
  totalSteps: number;
  passedSteps: number;
  finalSharpe: number;
  regimeBreakdown: Record<RegimeLabel, RegimeBreakdownEntry>;
  topFeatures: TopFeature[];
  recommendation: PipelineRecommendation;
  report: EvaluationReport | null;
}
