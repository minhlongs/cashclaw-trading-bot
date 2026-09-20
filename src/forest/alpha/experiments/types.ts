// Experiment Engine — Types
// Core abstractions for running, recording, and comparing alpha experiments.

import type { BacktestResult } from '@/forest/backtest/types';
import type { WalkForwardResult } from '@/forest/backtest/walkforward';
import type { RegimeLabel } from '@/tree/regime/types';
import type { ExperimentId, FeeModel, SlippageModel, FeatureSet, EntryRule, ExitRule, PositionSizing, Period } from './types-config';
import type { RegimePerformance, SymbolPerformance, PeriodMetrics } from './types-metrics';

export * from './types-config';
export * from './types-metrics';

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
