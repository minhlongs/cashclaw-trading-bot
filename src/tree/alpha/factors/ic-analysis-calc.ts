import { icInformationRatio, meanStd, regimeIcBreakdown, signConsistencyStability } from './ic-metrics';
import { rebalancePoint, topBucketWeights, turnoverSeries } from './ic-quantile';
import { collectPairs, MIN_VALID_IC_OBSERVATIONS, type IcPoint, type QuantileSpreadPoint } from './ic-helpers';
import type { SymbolPanel } from './panel';
import type { IcAnalysisConfig, IcAnalysisResult } from './ic-analysis-types';

export function runIcRebalanceLoop(
  panels: readonly SymbolPanel[],
  scores: Readonly<Record<string, readonly (number | null)[]>>,
  fwd: ReadonlyMap<string, readonly (number | null)[]>,
  times: readonly number[],
  stride: number,
  minSym: number,
  q: number,
): { icSeries: IcPoint[]; spread: QuantileSpreadPoint[]; topWeights: Record<string, number>[] } {
  const icSeries: IcPoint[] = [], spread: QuantileSpreadPoint[] = [], topWeights: Record<string, number>[] = [];
  for (let i = 0; i < times.length; i += stride) {
    const pairs = collectPairs(panels, scores, fwd, i);
    const res = rebalancePoint(times[i]!, pairs, minSym, q);
    icSeries.push(res.point); spread.push(res.spread); topWeights.push(topBucketWeights(pairs, q));
  }
  return { icSeries, spread, topWeights };
}

export function compileIcResult(icSeries: IcPoint[], spread: QuantileSpreadPoint[], topW: Record<string, number>[], cfg: IcAnalysisConfig, win: number): IcAnalysisResult {
  const validIcs = icSeries.flatMap((p) => (p.ic === null ? [] : [p.ic]));
  const validRankIcs = icSeries.flatMap((p) => (p.rankIc === null ? [] : [p.rankIc]));
  const icStats = meanStd(validIcs), rankStats = meanStd(validRankIcs);
  return {
    icSeries, icMean: icStats?.mean ?? null, icStd: icStats?.std ?? null,
    icIr: icInformationRatio(validIcs), rankIcMean: rankStats?.mean ?? null,
    stability: signConsistencyStability(validIcs, win), validIcCount: validIcs.length,
    insufficientIcObservations: validIcs.length < MIN_VALID_IC_OBSERVATIONS,
    quantileSpread: spread, quantileTurnover: turnoverSeries(topW),
    regimeBreakdown: cfg.regimeLabels ? regimeIcBreakdown(icSeries.map((p) => p.timestamp), icSeries.map((p) => p.ic), cfg.regimeLabels) : [],
  };
}
