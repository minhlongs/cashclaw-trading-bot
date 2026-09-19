// Per-component stability calculations for relative-value research.

import { estimateRollingHedgeRatio } from './hedge-ratio';
import { validatePairTradable } from './validation';
import type { IndicatorCandle } from '../indicator-types';
import type { PairPanel } from './types';
import type { PairStabilityConfig } from './stability-types';

export function candles(timestamps: readonly number[], closes: readonly number[]): IndicatorCandle[] {
  return timestamps.map((t, i) => ({
    timestamp: t, open: closes[i]!, high: closes[i]!, low: closes[i]!, close: closes[i]!, volume: 0,
  }));
}

/** Zero-crossing rate of the β-residual series around its own mean. */
export function crossingRate(closesA: number[], closesB: number[], beta: number): number {
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
export function gatePassFraction(
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
export function betaDriftPenalty(
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
