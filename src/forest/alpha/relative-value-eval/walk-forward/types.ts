// Relative-value walk-forward types.
// Pure types only — no I/O, no network.

import type { SelectedPair } from '@/tree/alpha/relative-value';
import type { PairPanel, PairPeriodRecord } from '@/tree/alpha/relative-value';

/** Window bounds in BAR INDICES (from computeSlices) and timestamps. */
export interface RVWindowBounds {
  readonly trainStart: number;
  readonly trainEnd: number;
  readonly validateStart: number;
  readonly validateEnd: number;
  readonly testStart: number;
  readonly testEnd: number;
  /** Epoch ms of the bar at each boundary (length = bars count + 1). */
  readonly trainEndTime: number;
  readonly testStartTime: number;
}

/** One walk-forward window's outcome. */
export interface RVWindowResult {
  readonly bounds: RVWindowBounds;
  /** Pairs selected inside the training window (causal — blind to test data). */
  readonly selectedPairs: readonly SelectedPair[];
}

/** Per-pair OOS output for one window. */
export interface RVPairWindowResult {
  /** Pair identity as legA/legB. */
  readonly pairLabel: string;
  /** OOS periods only (decided at ts >= testStart). */
  readonly oosPeriods: readonly PairPeriodRecord[];
  /** Panel actually simulated for this pair/window. */
  readonly panel: PairPanel;
}

/** Stitched cross-window aggregate over all OOS periods. */
export interface RVStitchedResult {
  /** All OOS net returns across windows/pairs, in chronological order. */
  readonly netReturns: readonly number[];
  /** All OOS periods across windows/pairs. */
  readonly roundTripsSource: readonly PairPeriodRecord[];
}

/** Full relative-value walk-forward result. */
export interface RVWalkForwardResult {
  readonly windows: readonly RVWindowResult[];
  /** Per-window per-pair OOS slices. */
  readonly perPairWindows: readonly RVPairWindowResult[];
  /** Cross-window stitched aggregates. */
  readonly stitched: RVStitchedResult;
}
