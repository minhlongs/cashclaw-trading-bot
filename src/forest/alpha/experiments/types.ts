// Experiment Engine — Types
// Core abstractions for running, recording, and comparing alpha experiments.

import type { BacktestResult } from '@/forest/backtest/types';
import type { WalkForwardResult } from '@/forest/backtest/walkforward';
import type { RegimeLabel } from '@/tree/regime/types';

// ── Identifiers ──────────────────────────────────────────────────────────────

/** Unique experiment identifier (UUID or slug). */
export type ExperimentId = string;

// ── Cost Models ──────────────────────────────────────────────────────────────

/** Fixed-cost or percentage-based fee model. */
export interface FeeModel {
  type: 'fixed' | 'percentage';
  /** Absolute cost per trade (fixed) or fraction of notional (percentage). */
  value: number;
}

/** Fixed, percentage, or adaptive slippage model. */
export interface SlippageModel {
  type: 'fixed' | 'percentage' | 'dynamic';
  /** Base slippage value (absolute or fraction depending on type). */
  value: number;
}

// ── Feature & Rule Configs ───────────────────────────────────────────────────

/** Named set of feature identifiers applied during the experiment. */
export interface FeatureSet {
  name: string;
  features: string[];
}

/** Entry condition specification. */
export interface EntryRule {
  type: 'signal' | 'ml' | 'threshold';
  signal?: string;
  threshold?: number;
  direction?: 'buy' | 'sell';
}

/** Exit condition specification. */
export interface ExitRule {
  type: 'signal' | 'stoploss' | 'takeprofit' | 'trailing';
  value: number;
  signal?: string;
}

/** Position sizing strategy. */
export interface PositionSizing {
  type: 'fixed' | 'percent_capital' | 'kelly' | 'volatility_target';
  value: number;
}

// ── Time Periods ─────────────────────────────────────────────────────────────

/** ISO-8601 date strings marking the boundaries of a period. */
export interface Period {
  start: string;
  end: string;
}

// ── Performance Breakdowns ───────────────────────────────────────────────────

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

// ── Experiment Definition ────────────────────────────────────────────────────

/** Full experiment specification. Immutable once created. */
export interface Experiment {
  id: ExperimentId;
  hypothesis: string;
  dataset: string;
  symbol: string;
  timeframe: string;
  featureSet: FeatureSet;
  regimeFilter: RegimeLabel[];
  entryRule: EntryRule;
  exitRule: ExitRule;
  positionSizing: PositionSizing;
  feeModel: FeeModel;
  slippageModel: SlippageModel;
  trainPeriod: Period;
  validationPeriod: Period;
  testPeriod: Period;
  randomSeed?: number;
  gitCommit?: string;
  configSnapshot: Record<string, unknown>;
}

// ── Experiment Result ────────────────────────────────────────────────────────

/** Execution status of an experiment run. */
export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Full result of a completed experiment. */
export interface ExperimentResult {
  experimentId: ExperimentId;
  executedAt: string;
  status: ExperimentStatus;
  trainMetrics: PeriodMetrics;
  validationMetrics: PeriodMetrics;
  testMetrics: PeriodMetrics;
  walkForwardResult?: WalkForwardResult;
  trainBacktest: BacktestResult;
  validationBacktest: BacktestResult;
  testBacktest: BacktestResult;
  regimePerformance: RegimePerformance;
  symbolPerformance: SymbolPerformance;
  /** Filesystem paths to JSON artefacts produced by this run. */
  artifacts: string[];
  /** Error message when status is 'failed'. */
  error?: string;
}

// ── Dependency Injection ─────────────────────────────────────────────────────

/** Functions the runner depends on — injected for testability. */
export interface ExperimentDeps {
  runBacktest: (candles: unknown[], options: Record<string, unknown>) => Promise<BacktestResult>;
  runWalkForward: (candles: unknown[], config: Record<string, unknown>) => Promise<WalkForwardResult>;
  classifyRegime: (candles: unknown[], index: number) => RegimeLabel;
  computeFeatures: (candles: unknown[], featureNames: string[]) => Promise<unknown[]>;
  labelTripleBarrier: (candles: unknown[], cfg: Record<string, unknown>) => Promise<string[]>;
}
