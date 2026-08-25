// Parameter robustness grid for relative-value arms.
// Bounded grid entryZ(3) × hedgeWindow(3) × stressMode(4) = 36 runs/arm,
// every run through the REAL walk-forward driver (runRVWalkForward →
// runPairSpreadSim only). Produces:
//   1. the sensitivity table via parameterSensitivity() over neighboring
//      grid configs (params = [entryZIdx, hedgeWindowIdx, stressIdx] so
//      adjacency means exactly one grid step), and
//   2. the config × OOS-window matrix feeding the pboProxy ceiling.
//
// ANTI-CHERRY-PICKING: the grid exists to MEASURE fragility — never to
// select a better-looking config. The primary arm's config is fixed before
// any run; no "best config" is reported here on purpose.
// Pure and deterministic.

import type { StressMode } from '@/tree/alpha/cost-stress';
import type {
  PairSelectionConfig,
  PairSimConfig,
  UniversePanel,
} from '@/tree/alpha/relative-value';
import type { WindowConfig, WindowMode } from '@/forest/backtest/walkforward';
import {
  parameterSensitivity,
  type GridResult,
  type ParameterSensitivityOptions,
  type ParameterSensitivityResult,
} from '@/forest/alpha/multiple-testing';
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

/** Full robustness report for one arm. */
export interface RvRobustnessReport {
  readonly entries: readonly RvRobustnessEntry[];
  readonly sensitivity: ParameterSensitivityResult;
  /** Config × OOS-window expectancy matrix feeding the PBO proxy. */
  readonly configMatrix: readonly (readonly number[])[];
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

function runGridPoint(
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

/**
 * Run the full 36-point grid and derive sensitivity + PBO-proxy inputs.
 * Fail-closed when costBps pins costs (the stress axis would silently do
 * nothing) or when the walk-forward driver rejects any grid point.
 */
export function runRvRobustness(input: RvRobustnessInput): RvRobustnessReport {
  if (input.baseSimConfig.costBps !== undefined) {
    throw new Error(
      'runRvRobustness: baseSimConfig.costBps must be unset so the stress-mode axis actually varies costs',
    );
  }
  const entries: RvRobustnessEntry[] = [];
  const gridResults: GridResult[] = [];
  let index = 0;
  for (const entryZ of ROBUSTNESS_ENTRY_Z) {
    for (const hedgeWindow of ROBUSTNESS_HEDGE_WINDOWS) {
      for (const stressMode of ROBUSTNESS_STRESS_MODES) {
        const entry = runGridPoint(input, entryZ, hedgeWindow, stressMode);
        entries.push(entry);
        // params use GRID INDICES so neighbors differ by exactly one step.
        gridResults.push({
          params: [
            Math.floor(index / (ROBUSTNESS_HEDGE_WINDOWS.length * ROBUSTNESS_STRESS_MODES.length)),
            Math.floor(index / ROBUSTNESS_STRESS_MODES.length) %
              ROBUSTNESS_HEDGE_WINDOWS.length,
            index % ROBUSTNESS_STRESS_MODES.length,
          ],
          metric: entry.expectancy,
        });
        index++;
      }
    }
  }
  return {
    entries,
    sensitivity: parameterSensitivity(gridResults, input.sensitivityOptions),
    configMatrix: entries.map((e) => e.windowMeans),
  };
}
