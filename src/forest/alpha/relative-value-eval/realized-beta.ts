// Realized pair beta diagnostic for the evaluation seam.
// Pure, deterministic — DIAGNOSTIC ONLY, never used for sizing.
// Causality inherited from estimateRollingBetas: each period's betas use
// only returns with timestamp STRICTLY BEFORE that period's timestamp.

import type { PairPanel, PairPeriodRecord } from '@/tree/alpha/relative-value';
import type { AssetReturnSeries } from '@/tree/alpha/cross-sectional/types';
import { estimateRollingBetas } from '@/tree/alpha/cross-sectional/beta-sizing';
import type { RelativeValueEvalConfig } from './types';

const DEFAULT_BETA_WINDOW = 20;
const DEFAULT_BETA_MIN_OBS = 10;

/** Per-leg simple returns earned i→i+1, attributed to timestamp i. */
function legSeries(symbol: string, panel: PairPanel, closes: readonly number[]): AssetReturnSeries {
  const returns: number[] = [];
  for (let i = 0; i < closes.length - 1; i++) {
    returns.push(closes[i + 1]! / closes[i]! - 1);
  }
  return { symbol, timestamps: panel.timestamps.slice(0, panel.timestamps.length - 1), returns };
}

function realizedAt(
  period: PairPeriodRecord,
  panel: PairPanel,
  legs: readonly AssetReturnSeries[],
  benchmark: AssetReturnSeries,
  window: number,
  minObs: number,
): number {
  const betas = estimateRollingBetas(legs, benchmark, window, minObs, period.timestamp);
  const betaA = betas[panel.legA];
  const betaB = betas[panel.legB];
  const wA = period.weights[panel.legA] ?? 0;
  const wB = period.weights[panel.legB] ?? 0;
  // Fail-closed: a null leg beta contributes 0, never an invented value.
  return wA * (betaA ?? 0) + wB * (betaB ?? 0);
}

/**
 * Per-period realized pair beta w_A·β̂_A + w_B·β̂_B using only history
 * strictly before each period timestamp. Returns undefined when no
 * benchmark is supplied (diagnostic absent by design).
 */
export function computeRealizedPairBetaSeries(
  panel: PairPanel,
  periods: readonly PairPeriodRecord[],
  config: RelativeValueEvalConfig,
): number[] | undefined {
  if (config.benchmarkReturns === undefined) return undefined;
  const window = config.betaWindow ?? DEFAULT_BETA_WINDOW;
  const minObs = config.betaMinObs ?? DEFAULT_BETA_MIN_OBS;
  const legs = [
    legSeries(panel.legA, panel, panel.closesA),
    legSeries(panel.legB, panel, panel.closesB),
  ];
  return periods.map((period) =>
    realizedAt(period, panel, legs, config.benchmarkReturns!, window, minObs),
  );
}