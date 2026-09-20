// Orchestrator for the relative-value robustness grid scan.
// Walks the full 36-point surface, then derives (1) the parameter-sensitivity
// table over neighboring grid configs and (2) the config × OOS-window matrix
// that feeds the PBO-proxy ceiling. Fail-closed when costBps pins costs (the
// stress axis would silently do nothing). Pure and deterministic.

import type {
  GridResult,
  ParameterSensitivityResult,
} from '@/forest/alpha/multiple-testing/overfitting-types';
import { parameterSensitivity } from '@/forest/alpha/multiple-testing/overfitting-proxy';
import {
  ROBUSTNESS_ENTRY_Z,
  ROBUSTNESS_HEDGE_WINDOWS,
  ROBUSTNESS_STRESS_MODES,
  runGridPoint,
  type RvRobustnessEntry,
  type RvRobustnessInput,
} from './robustness-grid';

/** Full robustness report for one arm. */
export interface RvRobustnessReport {
  readonly entries: readonly RvRobustnessEntry[];
  readonly sensitivity: ParameterSensitivityResult;
  /** Config × OOS-window expectancy matrix feeding the PBO proxy. */
  readonly configMatrix: readonly (readonly number[])[];
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
