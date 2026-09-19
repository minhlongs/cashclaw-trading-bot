// Causal pair selection inside a training window.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract: selectPairs consumes ONLY rows with timestamp
// STRICTLY BEFORE `asOfTime` (the current window's trainEnd). Mutating rows
// at or after that boundary leaves the selection identical (leakage-tested).

import { estimateRollingHedgeRatio } from './hedge-ratio';
import { validatePairTradable } from './validation';
import { computePairStability } from './stability';
import { assertPositiveCloses } from './pair-period';
import {
  type UniversePanel,
  type PairSelectionConfig,
  type PairSelectionDiagnostics,
  type SelectedPair,
} from './pair-selection-types';
import {
  assertUniverse,
  pairPanel,
  diagnosticsFor,
} from './pair-selection-helpers';

export {
  type UniversePanel,
  type PairSelectionConfig,
  type PairSelectionDiagnostics,
  type SelectedPair,
};

/**
 * Select and rank candidate pairs using ONLY rows with timestamp strictly
 * before `asOfTime`. Fail-closed: fewer than 2 symbols or malformed panels
 * throw; a too-short causal slice returns [] (nothing selectable).
 */
export function selectPairs(
  universe: UniversePanel,
  asOfTime: number,
  config: PairSelectionConfig,
): SelectedPair[] {
  assertUniverse(universe);
  if (universe.symbols.length < 2) {
    throw new Error('selectPairs: universe must contain at least 2 symbols');
  }
  if (!Number.isInteger(config.topK) || config.topK <= 0) {
    throw new Error('selectPairs: topK must be a positive integer');
  }
  if (Number.isNaN(asOfTime)) {
    throw new Error('selectPairs: asOfTime must not be NaN');
  }

  // Causal slice: indices strictly before asOfTime.
  let sliceEnd = 0;
  while (sliceEnd < universe.timestamps.length && universe.timestamps[sliceEnd]! < asOfTime) {
    sliceEnd++;
  }
  const required = Math.max(config.minObs, 10);
  if (sliceEnd < required) return [];

  const ts = universe.timestamps.slice(0, sliceEnd);
  const selected: SelectedPair[] = [];
  for (let i = 0; i < universe.symbols.length; i++) {
    for (let j = i + 1; j < universe.symbols.length; j++) {
      const panel = pairPanel(universe, i, j);
      assertPositiveCloses(
        { ...panel, timestamps: ts, closesA: panel.closesA.slice(0, sliceEnd), closesB: panel.closesB.slice(0, sliceEnd) },
        'selectPairs',
      );
      const a = panel.closesA.slice(0, sliceEnd);
      const b = panel.closesB.slice(0, sliceEnd);
      const diagnostics = diagnosticsFor(ts, a, b);
      if (Math.abs(diagnostics.correlation) < config.minCorrelation) continue;
      if (!config.distanceMode) {
        const verdict = validatePairTradable(panel, config, asOfTime);
        if (!verdict.tradable) continue;
      }
      const beta = estimateRollingHedgeRatio(panel, config.hedgeWindow, config.minObs, asOfTime);
      if (beta.hedgeRatio === null) continue;
      const stability = config.stability
        ? computePairStability(panel, config.stability, asOfTime).score
        : 0;
      selected.push({
        legA: panel.legA,
        legB: panel.legB,
        betaFrozen: beta.hedgeRatio,
        stability,
        diagnostics,
      });
    }
  }

  selected.sort(
    (x, y) =>
      y.stability - x.stability ||
      Math.abs(y.diagnostics.correlation) - Math.abs(x.diagnostics.correlation) ||
      `${x.legA}/${x.legB}`.localeCompare(`${y.legA}/${y.legB}`),
  );
  return selected.slice(0, config.topK);
}
