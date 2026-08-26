// ExperimentSpec — deterministic, readonly specification for an alpha experiment.
// Pure types — no I/O, no execution. The compiler emits this; downstream
// runners (Phase 2+) execute it. Derived from AlphaResearch OS spec §9.

import type { Universe } from '@/tree/alpha/universe/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { StressMode, StressConfig } from '@/forest/backtest/cost-model';
import type { FeatureDeclaration } from '@/tree/alpha/indicator-types';
import type { BarrierConfig } from '@/tree/alpha/labeling';
import type { AlphaProvenance } from './provenance';

/** Data window supplied by caller — compiler does NOT fetch data. */
export interface DataWindow {
  readonly earliestTimestamp: number; // ms epoch
  readonly latestTimestamp: number;   // ms epoch
  readonly barCount: number;          // number of bars in the window
}

/** Training/validation/test period derived from DataWindow. */
export interface ExperimentPeriod {
  readonly startTimestamp: number;
  readonly endTimestamp: number;
  readonly barCount: number;
}

/** Experiment specification (deterministic, readonly). */
export interface ExperimentSpec {
  /** SHA-256 of canonical JSON of spec body (excluding compiledAt). */
  readonly specId: string;
  /** Originating hypothesis ID. */
  readonly hypothesisId: string;
  /** Optional goal ID the experiment binds to. */
  readonly goalId: string | null;
  /** Universe the experiment runs over. */
  readonly universe: Universe;
  /** Candle timeframe (e.g., '1h', '4h', '1d'). */
  readonly timeframe: string;
  /** Forecast horizon in bars (positive integer). */
  readonly horizonBars: number;
  /** Declared features (output of declareFeature). */
  readonly features: readonly FeatureDeclaration[];
  /** Transformation names applied to features. */
  readonly transformations: readonly string[];
  /** Regime constraints the hypothesis is valid for. */
  readonly regimeConstraints: readonly RegimeLabel[];
  /** Expected trade direction. */
  readonly expectedDirection: 'long' | 'short' | 'neutral';
  /** Stress mode for cost assumptions. */
  readonly costMode: StressMode;
  /** Resolved cost config for this stress mode. */
  readonly costConfig: StressConfig;
  /** Barrier config derived from horizon (TP/SL/timeout proportional). */
  readonly barrierConfig: BarrierConfig;
  /** Training period derived from dataWindow. */
  readonly trainPeriod: ExperimentPeriod;
  /** Validation period derived from dataWindow. */
  readonly validationPeriod: ExperimentPeriod;
  /** Test period derived from dataWindow. */
  readonly testPeriod: ExperimentPeriod;
  /** Fixed seed for reproducibility (derived from specId hash or default). */
  readonly seed: number;
  /** Provenance of the hypothesis (if imported). */
  readonly provenance: AlphaProvenance | null;
  /** ISO-8601 timestamp of compilation. */
  readonly compiledAt: string;
  /** Compiler schema version. */
  readonly compilerVersion: 1;
}

/** Compilation failure reason codes. */
export type CompileFailureCode =
  | 'MECHANISM_REJECTED'
  | 'CAUSAL_REJECTED'
  | 'DUPLICATE_FEATURE'
  | 'INVALID_LOOKBACK'
  | 'LOOKBACK_EXCEEDS_WINDOW'
  | 'EMPTY_UNIVERSE'
  | 'EMPTY_TIMEFRAME'
  | 'INSUFFICIENT_DATA_WINDOW'
  | 'INVALID_COST_MODE'
  | 'UNSUPPORTED_FEATURE'
  | 'INTERNAL_ERROR';

/** Compilation result. */
export type CompileResult =
  | { readonly ok: true; readonly value: ExperimentSpec }
  | { readonly ok: false; readonly reasons: readonly CompileFailureCode[] };

/** Derivation constants for barrier config from horizon. */
export const BARRIER_DERIVATION = {
  /** Take-profit as fraction of horizon (e.g., 2% per 10 bars → 0.002 per bar). */
  tpPerBar: 0.002,
  /** Stop-loss as fraction of horizon (e.g., 1% per 10 bars → 0.001 per bar). */
  slPerBar: 0.001,
  /** Max holding time multiplier: horizonBars * timeframeMs * this factor. */
  timeoutMultiplier: 3,
} as const;

/**
 * Derive a BarrierConfig from horizon and timeframe.
 * Default TP/SL/timeout proportional to horizon.
 * Derivation:
 * - takeProfitPct = horizonBars * BARRIER_DERIVATION.tpPerBar
 * - stopLossPct = horizonBars * BARRIER_DERIVATION.slPerBar
 * - maxHoldingMs = horizonBars * timeframeMs * BARRIER_DERIVATION.timeoutMultiplier
 * Where timeframeMs is derived from timeframe string (e.g., '1h' → 3600000ms).
 */
export function deriveBarrierConfig(
  horizonBars: number,
  timeframe: string,
): BarrierConfig {
  const timeframeMs = parseTimeframeToMs(timeframe);
  return {
    takeProfitPct: horizonBars * BARRIER_DERIVATION.tpPerBar,
    stopLossPct: horizonBars * BARRIER_DERIVATION.slPerBar,
    maxHoldingMs: horizonBars * timeframeMs * BARRIER_DERIVATION.timeoutMultiplier,
  };
}

/** Parse timeframe string to milliseconds. Supports: 1m, 5m, 15m, 30m, 1h, 4h, 1d. */
export function parseTimeframeToMs(tf: string): number {
  const match = tf.match(/^(\d+)([mhd])$/);
  if (!match) return 3_600_000; // default 1h
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'm':
      return value * 60_000;
    case 'h':
      return value * 3_600_000;
    case 'd':
      return value * 86_400_000;
    default:
      return 3_600_000;
  }
}

/** Minimum training bars required (configurable floor). */
export const MIN_TRAIN_BARS = 200;

/**
 * Derive train/validation/test periods from a DataWindow.
 * Split: 70% train, 15% validation, 15% test (chronological, no shuffle).
 * Returns null if window too small for horizon + lookbacks + MIN_TRAIN_BARS.
 */
export function derivePeriods(
  dataWindow: DataWindow,
  horizonBars: number,
  maxLookback: number,
): { train: ExperimentPeriod; validation: ExperimentPeriod; test: ExperimentPeriod } | null {
  const totalBars = dataWindow.barCount;
  const requiredBars = maxLookback + horizonBars + MIN_TRAIN_BARS;

  if (totalBars < requiredBars) {
    return null;
  }

  const trainBars = Math.floor(totalBars * 0.7);
  const validationBars = Math.floor(totalBars * 0.15);
  const testBars = totalBars - trainBars - validationBars;

  if (trainBars < MIN_TRAIN_BARS) {
    return null;
  }

  const msPerBar = (dataWindow.latestTimestamp - dataWindow.earliestTimestamp) / totalBars;

  const trainEndIdx = trainBars;
  const validationEndIdx = trainBars + validationBars;

  const trainStartTs = dataWindow.earliestTimestamp;
  const trainEndTs = dataWindow.earliestTimestamp + trainEndIdx * msPerBar;
  const validationEndTs = dataWindow.earliestTimestamp + validationEndIdx * msPerBar;
  const testEndTs = dataWindow.latestTimestamp;

  return {
    train: { startTimestamp: trainStartTs, endTimestamp: trainEndTs, barCount: trainBars },
    validation: { startTimestamp: trainEndTs, endTimestamp: validationEndTs, barCount: validationBars },
    test: { startTimestamp: validationEndTs, endTimestamp: testEndTs, barCount: testBars },
  };
}

/** Default fixed seed (deterministic fallback). */
export const DEFAULT_SEED = 0xCAFEBABE;

/**
 * Derive a deterministic seed from specId hash (first 8 hex chars → u32).
 * Used when caller does not supply a seed.
 */
export function deriveSeedFromSpecId(specId: string): number {
  const first8 = specId.slice(0, 8);
  return parseInt(first8, 16) >>> 0;
}