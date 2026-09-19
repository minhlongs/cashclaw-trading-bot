// Pair stability scoring for relative-value research.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract: the score at `windowEndAsOf` consumes ONLY panel
// entries with timestamp STRICTLY BEFORE `windowEndAsOf`. Mutating rows at
// or after that boundary leaves the score identical (leakage-tested).

import { estimateRollingHedgeRatio } from './hedge-ratio';
import { computeSpreadStatistics } from '../correlation/compute';
import type { PairPanel } from './types';
import { assertPositiveCloses } from './pair-period';
import {
  STABILITY_REASONS,
  type PairStabilityConfig,
  type PairStabilityComponents,
  type PairStabilityResult,
} from './stability-types';
import {
  candles,
  crossingRate,
  gatePassFraction,
  betaDriftPenalty,
} from './stability-components';

export {
  STABILITY_REASONS,
  type PairStabilityConfig,
  type PairStabilityComponents,
  type PairStabilityResult,
};

/**
 * Score pair stability as of `windowEndAsOf` using only rows with timestamp
 * STRICTLY BEFORE it. Fails closed (score 0 + reason) when the pre-asOf
 * slice is too short, sub-windows degenerate, or β is unavailable.
 */
export function computePairStability(
  panel: PairPanel,
  config: PairStabilityConfig,
  windowEndAsOf: number,
): PairStabilityResult {
  if (!Number.isInteger(config.subWindows) || config.subWindows < 2) {
    throw new Error('computePairStability: subWindows must be an integer >= 2');
  }
  if (
    panel.timestamps.length !== panel.closesA.length ||
    panel.timestamps.length !== panel.closesB.length
  ) {
    throw new Error('computePairStability: panel array lengths differ');
  }
  assertPositiveCloses(panel, 'computePairStability');
  if (Number.isNaN(windowEndAsOf)) {
    throw new Error('computePairStability: windowEndAsOf must not be NaN');
  }

  const idx: number[] = [];
  for (let i = 0; i < panel.timestamps.length; i++) {
    if (panel.timestamps[i]! < windowEndAsOf) idx.push(i);
  }
  const n = idx.length;
  if (n < config.subWindows * 2) {
    return { score: 0, components: null, reason: STABILITY_REASONS.insufficientObservations };
  }

  const size = Math.floor(n / config.subWindows);

  // (a) Gate pass fraction over contiguous sub-windows.
  const gateFraction = gatePassFraction(panel, config, idx, size);

  // (b) β drift across sub-window boundaries.
  const driftPenalty = betaDriftPenalty(panel, config, idx, size);
  if (driftPenalty === null) {
    return { score: 0, components: null, reason: STABILITY_REASONS.betaUnavailable };
  }

  // (c) Zero-crossing consistency vs half-life expectation on the full slice.
  const fullEst = estimateRollingHedgeRatio(panel, config.hedgeWindow, config.minObs, windowEndAsOf);
  if (fullEst.hedgeRatio === null) {
    return { score: 0, components: null, reason: STABILITY_REASONS.betaUnavailable };
  }
  const a = idx.map((i) => panel.closesA[i]!);
  const b = idx.map((i) => panel.closesB[i]!);
  const t = idx.map((i) => panel.timestamps[i]!);
  const stats = computeSpreadStatistics(candles(t, a), candles(t, b), n);
  const observed = crossingRate(a, b, fullEst.hedgeRatio);
  const expected = Number.isFinite(stats.halfLife) && stats.halfLife > 0
    ? 1 / (2 * stats.halfLife)
    : 0;
  const crossingConsistency = Math.max(0, 1 - Math.abs(observed - expected));

  const components: PairStabilityComponents = {
    gatePassFraction: gateFraction,
    betaDriftPenalty: driftPenalty,
    crossingConsistency,
  };
  const score = (gateFraction + driftPenalty + crossingConsistency) / 3;
  return { score, components };
}
