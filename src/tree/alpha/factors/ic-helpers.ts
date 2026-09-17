// Internal IC-analysis helpers + shared types (Phase 3, D4). Pure,
// deterministic — no I/O, no randomness. Re-exported from ic-analysis.ts;
// not imported directly by any other module.

import type { SymbolPanel } from './panel';
import type { ScorePair } from './ic-quantile';

/** One rebalance date's cross-sectional IC record. */
export interface IcPoint {
  readonly timestamp: number;
  /** Pearson IC; null when fewer than minCrossSectionalSymbols valid pairs. */
  readonly ic: number | null;
  /** Spearman rankIC; same null rule as ic. */
  readonly rankIc: number | null;
  /** Number of valid (finite score AND finite forward return) pairs. */
  readonly validSymbols: number;
}

/** RESEARCH METRIC ONLY — gross-of-cost quantile spread per rebalance. */
export interface QuantileSpreadPoint {
  readonly timestamp: number;
  /** meanFwd(top bucket) − meanFwd(bottom bucket); null when a leg is empty. */
  readonly spread: number | null;
}

const MIN_VALID_IC_OBSERVATIONS = 30;

interface ResolvedConfig {
  readonly rebalanceStride: number;
  readonly quantiles: number;
  readonly minCrossSectionalSymbols: number;
  readonly stabilityWindow: number;
}

function validateConfig(config: {
  readonly horizonBars: number;
  readonly rebalanceStride?: number;
  readonly quantiles?: number;
  readonly minCrossSectionalSymbols?: number;
  readonly stabilityWindow?: number;
}): ResolvedConfig {
  const stride = config.rebalanceStride ?? 1;
  const quantiles = config.quantiles ?? 2;
  const minSymbols = config.minCrossSectionalSymbols ?? 3;
  const stabilityWindow = config.stabilityWindow ?? 20;
  if (!Number.isInteger(config.horizonBars) || config.horizonBars < 1) {
    throw new Error(`analyzeIc: horizonBars must be a positive integer, got ${config.horizonBars}`);
  }
  if (!Number.isInteger(stride) || stride < 1) {
    throw new Error(`analyzeIc: rebalanceStride must be a positive integer, got ${stride}`);
  }
  if (!Number.isInteger(quantiles) || quantiles < 2 || quantiles > 5) {
    throw new Error(`analyzeIc: quantiles must be an integer in [2,5], got ${quantiles}`);
  }
  if (!Number.isInteger(minSymbols) || minSymbols < 2) {
    throw new Error(`analyzeIc: minCrossSectionalSymbols must be an integer ≥ 2, got ${minSymbols}`);
  }
  return { rebalanceStride: stride, quantiles, minCrossSectionalSymbols: minSymbols, stabilityWindow };
}

/** Fail-closed: every panel symbol must have an aligned score series. */
function validateScores(
  panels: readonly SymbolPanel[],
  scores: Readonly<Record<string, readonly (number | null)[]>>,
  length: number,
): void {
  for (const panel of panels) {
    const series = scores[panel.symbol];
    if (series === undefined) {
      throw new Error(`analyzeIc: no score series for symbol '${panel.symbol}'`);
    }
    if (series.length !== length) {
      throw new Error(
        `analyzeIc: score series for '${panel.symbol}' length ${series.length} !== panel length ${length}`,
      );
    }
  }
}

/** Collect finite score/fwd pairs across symbols at bar index i. */
function collectPairs(
  panels: readonly SymbolPanel[],
  scores: Readonly<Record<string, readonly (number | null)[]>>,
  forwardBySymbol: ReadonlyMap<string, readonly (number | null)[]>,
  i: number,
): ScorePair[] {
  const pairs: ScorePair[] = [];
  for (const panel of panels) {
    const score = scores[panel.symbol]?.[i];
    const fwd = forwardBySymbol.get(panel.symbol)?.[i];
    if (score === null || score === undefined || fwd === null || fwd === undefined) continue;
    if (!Number.isFinite(score) || !Number.isFinite(fwd)) continue;
    pairs.push({ symbol: panel.symbol, score, fwd });
  }
  return pairs;
}

export { MIN_VALID_IC_OBSERVATIONS, validateConfig, validateScores, collectPairs };
