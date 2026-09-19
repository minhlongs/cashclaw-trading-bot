// ExperimentSpec — deterministic, readonly specification for an alpha experiment.
// Pure types — no I/O, no execution. The compiler emits this; downstream
// runners (Phase 2+) execute it. Derived from AlphaResearch OS spec §9.

import type { Universe } from '@/tree/alpha/universe/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { StressMode, StressConfig } from '@/tree/alpha/cost-stress';
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
