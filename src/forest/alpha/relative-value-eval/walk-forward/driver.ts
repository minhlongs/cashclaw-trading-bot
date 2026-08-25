// Walk-forward driver for relative-value evaluation.
// Pure, deterministic — orchestrates selectPairs + runPairSpreadSim ONLY.
// No second simulation engine: every simulated period comes from
// runPairSpreadSim; every selection is causally confined to the window's
// training slice. Method arms differ ONLY via config variants.

import type { WindowConfig, WindowMode } from '@/forest/backtest/walkforward';
import {
  runPairSpreadSim,
  selectPairs,
  type PairPanel,
  type PairSelectionConfig,
  type PairSimConfig,
  type UniversePanel,
} from '@/tree/alpha/relative-value';
import { planWindows, type RVPlannedWindow } from './windows';
import type { RVPairWindowResult, RVWalkForwardResult, RVWindowResult } from './types';

/** Per-pair simulator config factory (method arms differ only via config). */
export type PairConfigFactory = (pair: PairPanel) => PairSimConfig;

function pairPanelFromUniverse(
  universe: UniversePanel,
  legA: string,
  legB: string,
): PairPanel | null {
  const i = universe.symbols.indexOf(legA);
  const j = universe.symbols.indexOf(legB);
  if (i < 0 || j < 0) return null;
  return {
    legA,
    legB,
    timestamps: universe.timestamps,
    closesA: universe.closes[i]!,
    closesB: universe.closes[j]!,
  };
}

/**
 * Run one planned window: causal selection on the training slice, then a
 * per-pair sim over the warmup+test panel with OOS filtering at testStart.
 * Empty selection is tolerated (records 0 trades — never crashes).
 */
export function runRVWindow(
  planned: RVPlannedWindow,
  selectionConfig: PairSelectionConfig,
  configFactory: PairConfigFactory,
): { window: RVWindowResult; pairs: RVPairWindowResult[] } {
  const selected = selectPairs(
    planned.trainUniverse,
    planned.bounds.trainEndTime,
    selectionConfig,
  );
  const window: RVWindowResult = {
    bounds: planned.bounds,
    selectedPairs: selected,
  };
  if (selected.length === 0) return { window, pairs: [] };

  // Frozen-β arms consume train-tail estimation via hedgeMode 'frozen'
  // inside the configFactory; OOS periods are those decided at ts >= testStart.
  const oosStart = planned.bounds.testStartTime;
  const pairs: RVPairWindowResult[] = [];
  for (const pair of selected) {
    const panel = pairPanelFromUniverse(planned.simUniverse, pair.legA, pair.legB);
    if (panel === null) continue;
    const sim = runPairSpreadSim(panel, configFactory(panel));
    const oosPeriods = sim.periods.filter((p) => p.timestamp >= oosStart);
    pairs.push({ pairLabel: `${pair.legA}/${pair.legB}`, oosPeriods, panel });
  }
  return { window, pairs };
}

/** Driver input. */
export interface RVDriverInput {
  readonly universe: UniversePanel;
  readonly windowConfig: WindowConfig;
  readonly mode: WindowMode;
  readonly selectionConfig: PairSelectionConfig;
  readonly configFactory: PairConfigFactory;
}

/**
 * Full walk-forward driver: plan windows → per-window causal selection + sims
 * → stitch every OOS period chronologically (stable sort keeps intra-pair
 * order at equal timestamps — deterministic).
 */
export function runRVWalkForward(input: RVDriverInput): RVWalkForwardResult {
  const plannedWindows = planWindows(input.universe, input.windowConfig, input.mode);
  const windows: RVWindowResult[] = [];
  const perPairWindows: RVPairWindowResult[] = [];
  for (const planned of plannedWindows) {
    const { window, pairs } = runRVWindow(planned, input.selectionConfig, input.configFactory);
    windows.push(window);
    perPairWindows.push(...pairs);
  }
  const roundTripsSource = perPairWindows
    .flatMap((p) => p.oosPeriods)
    .sort((a, b) => a.timestamp - b.timestamp);
  return {
    windows,
    perPairWindows,
    stitched: {
      netReturns: roundTripsSource.map((p) => p.netReturn),
      roundTripsSource,
    },
  };
}
