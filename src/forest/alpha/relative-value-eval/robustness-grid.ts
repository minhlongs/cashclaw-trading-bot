// Grid axes + single-point runner for the relative-value robustness scan.
// The 3 × 3 × 4 = 36 point grid is a MEASUREMENT surface (ANTI-CHERRY-PICKING):
// it quantifies fragility across entryZ / hedgeWindow / stressMode without ever
// selecting a "better-looking" config. The primary arm's config is fixed before
// any run. Pure and deterministic.

import type { StressMode } from '@/tree/alpha/cost-stress';
import type {
  PairSelectionConfig,
  PairSimConfig,
  UniversePanel,
} from '@/tree/alpha/relative-value';
import type { WindowConfig, WindowMode } from '@/forest/backtest/walkforward';
import type { ParameterSensitivityOptions } from '@/forest/alpha/multiple-testing/overfitting-types';
import { extractRoundTrips } from './round-trips';
import { runRVWalkForward } from './walk-forward';
import { bucketWindowStats, oosExpectancy } from './oos-windows';

/** Grid axes (pre-registered bounds, not a search space to mine). */
export const ROBUSTNESS_ENTRY_Z: readonly number[] = [1.5, 2.0, 2.5];
export const ROBUSTNESS_HEDGE_WINDOWS: readonly number[] = [30, 60, 90];
export const ROBUSTNESS_STRESS_MODES: readonly StressMode[] = [
  'normal',
  'conservative',
  'adverse',
  'extreme',
];
/** Total runs per arm = 3 × 3 × 4. */
export const ROBUSTNESS_RUN_COUNT =
  ROBUSTNESS_ENTRY_Z.length *
  ROBUSTNESS_HEDGE_WINDOWS.length *
  ROBUSTNESS_STRESS_MODES.length;

/** One grid point's outcome. */
export interface RvRobustnessEntry {
  readonly entryZ: number;
  readonly hedgeWindow: number;
  readonly stressMode: StressMode;
  /** Overall stitched OOS expectancy (mean per-period net return). */
  readonly expectancy: number;
  readonly completedTrades: number;
  /** Per-window mean net return (0 when the window traded nothing). */
  readonly windowMeans: readonly number[];
  readonly windowPeriodCounts: readonly number[];
}

/** Robustness input: base M4 configs whose sim knobs are overridden. */
export interface RvRobustnessInput {
  readonly universe: UniversePanel;
  readonly windowConfig: WindowConfig;
  readonly mode: WindowMode;
  readonly selectionConfig: PairSelectionConfig;
  /** Base sim config; entryZ/hedgeWindow/stressMode are overridden per point. */
  readonly baseSimConfig: PairSimConfig;
  readonly sensitivityOptions?: ParameterSensitivityOptions;
}

export function runGridPoint(
  input: RvRobustnessInput,
  entryZ: number,
  hedgeWindow: number,
  stressMode: StressMode,
): RvRobustnessEntry {
  const simConfig: PairSimConfig = {
    ...input.baseSimConfig,
    entryZ,
    hedgeWindow,
    stressMode,
  };
  const result = runRVWalkForward({
    universe: input.universe,
    windowConfig: input.windowConfig,
    mode: input.mode,
    selectionConfig: input.selectionConfig,
    configFactory: () => simConfig,
  });
  const stats = bucketWindowStats(result);
  return {
    entryZ,
    hedgeWindow,
    stressMode,
    expectancy: oosExpectancy(result),
    completedTrades: extractRoundTrips(result.stitched.roundTripsSource)
      .roundTrips.length,
    windowMeans: stats.means,
    windowPeriodCounts: stats.counts,
  };
}
