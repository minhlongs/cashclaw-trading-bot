import type { AlphaDecisionRecord } from '../../../tree/alpha/observability/types';
import type {
  AlphaEdgeAttribution,
  EdgeAttributionSection,
  RegimeEdgeAttribution,
} from './types';
import {
  aggregateAlpha,
  aggregateRegime,
  IntermediateRecord,
  resolveRealizedReturn,
  round4,
  round8,
} from './edge-diagnostics-aggregators';

export function computeEdgeDiagnostics(
  alphaDecisions: readonly AlphaDecisionRecord[],
  realizedReturns?: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
): EdgeAttributionSection {
  const count = alphaDecisions.length;
  if (count === 0) {
    return {
      expectedNetReturnMean: 0,
      realizedNetReturnMean: 0,
      edgeDeltaMean: 0,
      edgeErosionBps: 0,
      byAlpha: {},
      byRegime: {},
    };
  }

  const records: IntermediateRecord[] = alphaDecisions.map((d) => {
    const expNet = round8(d.expectedReturn - d.expectedCost);
    const realNet = round8(resolveRealizedReturn(d, realizedReturns));
    return {
      alphaId: d.alphaId,
      regime: d.regime,
      expNet,
      realNet,
      delta: round8(realNet - expNet),
    };
  });

  const totalExp = records.reduce((acc, r) => acc + r.expNet, 0);
  const totalReal = records.reduce((acc, r) => acc + r.realNet, 0);
  const meanExp = round8(totalExp / count);
  const meanReal = round8(totalReal / count);
  const meanDelta = round8(meanReal - meanExp);
  const edgeErosionBps = round4((meanExp - meanReal) * 10_000);

  const byAlphaMap: Record<string, IntermediateRecord[]> = {};
  const byRegimeMap: Record<string, IntermediateRecord[]> = {};
  for (const r of records) {
    (byAlphaMap[r.alphaId] ??= []).push(r);
    (byRegimeMap[r.regime] ??= []).push(r);
  }

  const byAlpha: Record<string, AlphaEdgeAttribution> = {};
  for (const [alphaId, group] of Object.entries(byAlphaMap)) {
    byAlpha[alphaId] = aggregateAlpha(group);
  }

  const byRegime: Record<string, RegimeEdgeAttribution> = {};
  for (const [regimeKey, group] of Object.entries(byRegimeMap)) {
    byRegime[regimeKey] = aggregateRegime(group);
  }

  return {
    expectedNetReturnMean: meanExp,
    realizedNetReturnMean: meanReal,
    edgeDeltaMean: meanDelta,
    edgeErosionBps,
    byAlpha,
    byRegime,
  };
}
