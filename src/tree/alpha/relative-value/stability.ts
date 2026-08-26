// Pair stability scoring for relative-value research.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract: the score at `windowEndAsOf` consumes ONLY panel
// entries with timestamp STRICTLY BEFORE `windowEndAsOf`. Mutating rows at
// or after that boundary leaves the score identical (leakage-tested).
//
// The strictly-prior slice is split into k contiguous sub-windows. Score in
// [0,1] blends three equally-weighted components (each exposed separately):
//   (a) gatePassFraction — fraction of sub-windows passing the conjunctive
//       tradability gate ("pass in more than one contiguous window");
//   (b) betaDriftPenalty — 1 − min(1, |β_last − β_first| / |β_first|) over
//       sub-window-end hedge-ratio estimates;
//   (c) crossingConsistency — 1 − |observed zero-crossing rate − expected
//       rate from the half-life|, capped at 0.
// Degenerate input fails closed: score 0 with a distinct reason.

import { estimateRollingHedgeRatio } from './hedge-ratio';
import { validatePairTradable, type TradabilityGateConfig } from './validation';
import { computeSpreadStatistics } from '../correlation/compute';
import type { IndicatorCandle } from '../indicator-types';
import type { PairPanel } from './types';
import { assertPositiveCloses } from './pair-period';

/** Distinct fail-closed reasons (tested verbatim). */
export const STABILITY_REASONS = {
  insufficientObservations: 'insufficient observations before window end',
  betaUnavailable: 'hedge ratio unavailable at a sub-window boundary',
} as const;

/** Config for computePairStability (gate config + sub-window count). */
export interface PairStabilityConfig extends TradabilityGateConfig {
  /** Number of contiguous sub-windows to split the pre-asOf slice into. */
  readonly subWindows: number;
  /** Hedge-ratio window for the β-drift component. */
  readonly hedgeWindow: number;
}

/** Per-component stability measurements. */
export interface PairStabilityComponents {
  /** Fraction of sub-windows passing the conjunctive gate, in [0,1]. */
  readonly gatePassFraction: number;
  /** 1 − normalized β drift, in [0,1]. */
  readonly betaDriftPenalty: number;
  /** Zero-crossing consistency vs half-life expectation, in [0,1]. */
  readonly crossingConsistency: number;
}

/** Stability verdict: score in [0,1] plus components or a fail-closed reason. */
export interface PairStabilityResult {
  readonly score: number;
  readonly components: PairStabilityComponents | null;
  /** Present iff score is 0 due to a degenerate input. */
  readonly reason?: string;
}

function candles(timestamps: readonly number[], closes: readonly number[]): IndicatorCandle[] {
  return timestamps.map((t, i) => ({
    timestamp: t, open: closes[i]!, high: closes[i]!, low: closes[i]!, close: closes[i]!, volume: 0,
  }));
}

/** Zero-crossing rate of the β-residual series around its own mean. */
function crossingRate(closesA: number[], closesB: number[], beta: number): number {
  const residuals = closesA.map((a, i) => closesB[i]! - beta * a);
  const residualMean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
  let crossings = 0;
  for (let i = 1; i < residuals.length; i++) {
    const prev = residuals[i - 1]! - residualMean;
    const curr = residuals[i]! - residualMean;
    if ((prev >= 0) !== (curr >= 0)) crossings++;
  }
  return crossings / Math.max(1, residuals.length - 1);
}

/** (a) Fraction of contiguous sub-windows passing the conjunctive gate. */
function gatePassFraction(
  panel: PairPanel,
  config: PairStabilityConfig,
  idx: readonly number[],
  size: number,
): number {
  let passes = 0;
  for (let w = 0; w < config.subWindows; w++) {
    const endIdx = idx[Math.min(idx.length - 1, (w + 1) * size - 1)]!;
    const verdict = validatePairTradable(panel, config, panel.timestamps[endIdx]! + 1);
    if (verdict.tradable) passes++;
  }
  return passes / config.subWindows;
}

/** (b) 1 − normalized β drift over sub-window boundaries; null when β unavailable. */
function betaDriftPenalty(
  panel: PairPanel,
  config: PairStabilityConfig,
  idx: readonly number[],
  size: number,
): number | null {
  const betas: number[] = [];
  for (let w = 1; w <= config.subWindows; w++) {
    const boundaryIdx = idx[Math.min(idx.length - 1, w * size - 1)]!;
    const est = estimateRollingHedgeRatio(
      panel, config.hedgeWindow, config.minObs, panel.timestamps[boundaryIdx]! + 1,
    );
    if (est.hedgeRatio === null) return null;
    betas.push(est.hedgeRatio);
  }
  const first = betas[0]!;
  const last = betas[betas.length - 1]!;
  return 1 - Math.min(1, Math.abs(last - first) / Math.abs(first));
}

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
