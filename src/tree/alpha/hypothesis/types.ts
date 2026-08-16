// Hypothesis Engine — Types
// Alpha hypothesis generation, templates, and evaluation results.

import type { CombinerMethod, AlphaDirection } from '../types';
import type { IndicatorFn, IndicatorRegistry } from '../indicator-types';
import type { BarrierConfig } from '../labeling';
import { RegimeLabel } from '../../regime/types';
import type { OptimizerMethod } from '../portfolio/types';

// ── Indicator Preset ───────────────────────────────────────────────────────────

/** Per-indicator settings within a hypothesis. */
export interface IndicatorPreset {
  /** Registry key (e.g. 'sma', 'rsi', 'macd'). */
  indicator: string;
  /** Lookback window in candles. */
  lookback: number;
  /** Optional timeframe override. */
  timeframe?: string;
}

// ── Alpha Hypothesis ───────────────────────────────────────────────────────────

/** A complete alpha hypothesis: tested combination of indicators + execution config. */
export interface AlphaHypothesis {
  /** Unique identifier (slug). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Brief description of the strategy logic. */
  description: string;
  /** Ordered indicator set with per-indicator settings. */
  indicatorSet: IndicatorPreset[];
  /** How to combine individual indicator signals. */
  combineMethod: CombinerMethod;
  /** Which market regimes this hypothesis targets (empty = all). */
  regimeFilter: RegimeLabel[];
  /** Barrier configuration for labeling. */
  barrierConfig: BarrierConfig;
  /** Portfolio sizing method for the optimizer. */
  optimizerMethod: OptimizerMethod;
  /** Expected confidence (0–1), set by generator, updated by evaluator. */
  confidence: number;
  /** ISO timestamp of creation. */
  createdAt: string;
}

// ── Hypothesis Template ────────────────────────────────────────────────────────

/** Named preset for generating hypotheses with a specific style. */
export interface HypothesisTemplate {
  /** Template name. */
  name: string;
  /** Description of the strategy. */
  description: string;
  /** Fixed indicator choices. */
  indicatorPreset: IndicatorPreset[];
  /** Target regimes. */
  regimePreset: RegimeLabel[];
  /** Barrier config preset. */
  barrierPreset: BarrierConfig;
  /** Combiner config preset. */
  combinePreset: CombinerMethod;
}

// ── Hypothesis Evaluation ──────────────────────────────────────────────────────

/** Result of evaluating a hypothesis against candle history. */
export interface HypothesisEvaluation {
  /** Hypothesis that was evaluated. */
  hypothesisId: string;
  /** Total signals generated. */
  totalSignals: number;
  /** Average confidence across signals (0–1). */
  avgConfidence: number;
  /** Fraction of signals that resolved with a valid label (0–1). */
  passRate: number;
  /** Performance breakdown by regime. */
  regimePerformance: Record<string, RegimePerf>;
  /** Overall win rate (0–1). */
  winRate: number;
}

/** Per-regime performance metrics. */
export interface RegimePerf {
  /** Signal count in this regime. */
  signalCount: number;
  /** Win rate in this regime. */
  winRate: number;
  /** Average confidence in this regime. */
  avgConfidence: number;
}