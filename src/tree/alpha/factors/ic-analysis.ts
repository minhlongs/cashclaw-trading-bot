// Factor IC/RankIC analysis over an aligned symbol×time panel (Phase 3, D4).
// Pure, deterministic — no I/O, no randomness. Composes panel.ts forward
// returns + ic-metrics.ts primitives; quantile/turnover helpers live in
// ic-quantile.ts (turnover REUSES cross-sectional computeTurnover verbatim).
//
// CAUSALITY NOTE (binding): IC correlates point-in-time scores with FORWARD
// returns — future data by definition. IC is an EVALUATION metric only; it
// must never feed signal construction. Quantile spread is GROSS of costs and
// labeled RESEARCH METRIC ONLY everywhere it appears.

import { buildForwardReturnSeries, validateAlignedPanels, type SymbolPanel } from './panel';
import {
  icInformationRatio,
  meanStd,
  regimeIcBreakdown,
  signConsistencyStability,
  type RegimeIcSummary,
} from './ic-metrics';
import { rebalancePoint, topBucketWeights, turnoverSeries, type ScorePair } from './ic-quantile';

/** Analysis configuration (D4). */
export interface IcAnalysisConfig {
  /** Forward-return horizon in bars (positive integer). */
  readonly horizonBars: number;
  /** Rebalance cadence in bars (positive integer, default 1). */
  readonly rebalanceStride?: number;
  /** Quantile buckets for spread, 2–5 (default 2). */
  readonly quantiles?: number;
  /** Min valid score/fwd pairs per rebalance for a non-null IC (default 3). */
  readonly minCrossSectionalSymbols?: number;
  /** Rolling window for sign-consistency stability (default 20). */
  readonly stabilityWindow?: number;
  /** Injected regime labels keyed by timestamp (never computed here). */
  readonly regimeLabels?: Readonly<Record<number, string>>;
}

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

/** Full IC analysis output. */
export interface IcAnalysisResult {
  readonly icSeries: IcPoint[];
  readonly icMean: number | null;
  readonly icStd: number | null;
  readonly icIr: number | null;
  readonly rankIcMean: number | null;
  /** Rolling sign-consistency stability (see ic-metrics). */
  readonly stability: number | null;
  /** Count of valid (non-null) IC observations. */
  readonly validIcCount: number;
  /** True when validIcCount < 30 — flagged, never padded (D5). */
  readonly insufficientIcObservations: boolean;
  /** RESEARCH METRIC ONLY: top−bottom quantile spread, gross of costs. */
  readonly quantileSpread: QuantileSpreadPoint[];
  /** One-sided long-leg turnover between consecutive rebalances. */
  readonly quantileTurnover: number[];
  /** Mean IC per injected regime label; empty when no labels supplied. */
  readonly regimeBreakdown: RegimeIcSummary[];
}

const MIN_VALID_IC_OBSERVATIONS = 30;

interface ResolvedConfig {
  readonly rebalanceStride: number;
  readonly quantiles: number;
  readonly minCrossSectionalSymbols: number;
  readonly stabilityWindow: number;
}

function validateConfig(config: IcAnalysisConfig): ResolvedConfig {
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

/**
 * Run the full IC analysis. `scores[symbol]` must be a (number|null)[] aligned
 * with that symbol's panel timestamps; missing symbols throw (fail-closed).
 * Panels are validated + alignment-checked before any computation.
 */
export function analyzeIc(
  panels: readonly SymbolPanel[],
  scores: Readonly<Record<string, readonly (number | null)[]>>,
  config: IcAnalysisConfig,
): IcAnalysisResult {
  const { rebalanceStride, quantiles, minCrossSectionalSymbols, stabilityWindow } =
    validateConfig(config);
  validateAlignedPanels(panels);
  const timestamps = panels[0]!.timestamps;
  const forwardBySymbol = new Map(
    panels.map((p) => [p.symbol, buildForwardReturnSeries(p, config.horizonBars).forwardReturns]),
  );
  validateScores(panels, scores, timestamps.length);

  const icSeries: IcPoint[] = [];
  const quantileSpread: QuantileSpreadPoint[] = [];
  const topWeightsPerRebalance: Record<string, number>[] = [];
  for (let i = 0; i < timestamps.length; i += rebalanceStride) {
    const pairs = collectPairs(panels, scores, forwardBySymbol, i);
    const { point, spread } = rebalancePoint(timestamps[i]!, pairs, minCrossSectionalSymbols, quantiles);
    icSeries.push(point);
    quantileSpread.push(spread);
    topWeightsPerRebalance.push(topBucketWeights(pairs, quantiles));
  }

  const validIcs = icSeries.flatMap((p) => (p.ic === null ? [] : [p.ic]));
  const validRankIcs = icSeries.flatMap((p) => (p.rankIc === null ? [] : [p.rankIc]));
  const icStats = meanStd(validIcs);
  const rankStats = meanStd(validRankIcs);
  return {
    icSeries,
    icMean: icStats?.mean ?? null,
    icStd: icStats?.std ?? null,
    icIr: icInformationRatio(validIcs),
    rankIcMean: rankStats?.mean ?? null,
    stability: signConsistencyStability(validIcs, stabilityWindow),
    validIcCount: validIcs.length,
    insufficientIcObservations: validIcs.length < MIN_VALID_IC_OBSERVATIONS,
    quantileSpread,
    quantileTurnover: turnoverSeries(topWeightsPerRebalance),
    regimeBreakdown:
      config.regimeLabels === undefined
        ? []
        : regimeIcBreakdown(
            icSeries.map((p) => p.timestamp),
            icSeries.map((p) => p.ic),
            config.regimeLabels,
          ),
  };
}
