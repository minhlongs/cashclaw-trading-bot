// Pair selection type definitions.

import type { TradabilityGateConfig } from './validation';
import type { PairStabilityConfig } from './stability-types';

/** Aligned multi-symbol close panel (shared timestamps across symbols). */
export interface UniversePanel {
  readonly symbols: readonly string[];
  readonly timestamps: readonly number[];
  /** closes[symbolIndex][barIndex]; every row equal length to timestamps. */
  readonly closes: readonly (readonly number[])[];
}

/** Selection config: gate fields + ranking knobs. */
export interface PairSelectionConfig extends TradabilityGateConfig {
  /** Hedge-ratio window for the frozen β estimate. */
  readonly hedgeWindow: number;
  /** Maximum pairs to return (ranked). */
  readonly topK: number;
  /** Distance-mode (M1): corr floor + minObs only; skip cointegration gate. */
  readonly distanceMode?: boolean;
  /** Stability config; when set, pairs are ranked by stability score. */
  readonly stability?: PairStabilityConfig;
}

/** Selection-time diagnostics for one candidate pair. */
export interface PairSelectionDiagnostics {
  readonly correlation: number;
  readonly cointegrated: boolean;
  readonly pValue: number;
  readonly halfLife: number | null;
  readonly observationCount: number;
}

/** One selected pair with its frozen β and ranking inputs. */
export interface SelectedPair {
  readonly legA: string;
  readonly legB: string;
  readonly betaFrozen: number;
  readonly stability: number;
  readonly diagnostics: PairSelectionDiagnostics;
}
