import type { CostStressTier, ShadowFill, ShadowOrderSide } from './types';
import type {
  EdgeAttributionParams,
  BatchEdgeAttributionResult,
  SlippageAggregationSummary,
  BatchSlippageAttributionResult,
} from './attribution-types';
import {
  round8,
  computeSingleEdge,
  computeSingleSlippage,
} from './attribution-cost-calculators';

export function computeBatchEdgeAttribution(records: readonly EdgeAttributionParams[]): BatchEdgeAttributionResult {
  const results = records.map(computeSingleEdge);
  const count = results.length;
  if (count === 0) return { count: 0, meanExpectedNetReturn: 0, meanRealizedNetReturn: 0, meanDeltaEdge: 0, byAlphaId: {}, byRegime: {}, records: [] };
  const byAlpha: Record<string, { c: number; e: number; r: number; d: number }> = {};
  const byReg: Record<string, { c: number; e: number; r: number; d: number }> = {};
  let totalExp = 0; let totalReal = 0; let totalDelta = 0;
  for (const r of results) {
    totalExp += r.expectedNetReturn; totalReal += r.realizedNetReturn; totalDelta += r.deltaEdge;
    const a = byAlpha[r.alphaId ?? 'unknown'] ??= { c: 0, e: 0, r: 0, d: 0 };
    a.c++; a.e += r.expectedNetReturn; a.r += r.realizedNetReturn; a.d += r.deltaEdge;
    const reg = byReg[r.regime ?? 'unknown'] ??= { c: 0, e: 0, r: 0, d: 0 };
    reg.c++; reg.e += r.expectedNetReturn; reg.r += r.realizedNetReturn; reg.d += r.deltaEdge;
  }
  const toSum = (m: Record<string, { c: number; e: number; r: number; d: number }>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, {
      count: v.c, meanExpectedNetReturn: round8(v.e / v.c), meanRealizedNetReturn: round8(v.r / v.c), meanDeltaEdge: round8(v.d / v.c),
    }]));
  return {
    count, meanExpectedNetReturn: round8(totalExp / count), meanRealizedNetReturn: round8(totalReal / count), meanDeltaEdge: round8(totalDelta / count),
    byAlphaId: toSum(byAlpha), byRegime: toSum(byReg), records: results,
  };
}

export function computeBatchSlippageAttribution(fills: readonly ShadowFill[], expectedOverride?: number): BatchSlippageAttributionResult {
  const records = fills.map((f) => computeSingleSlippage(f, expectedOverride));
  const count = records.length;
  const tierAcc = Object.fromEntries((['normal', 'conservative', 'adverse', 'extreme'] as const).map((t) => [t, { c: 0, r: 0, e: 0, d: 0 }]));
  const sideAcc = Object.fromEntries((['buy', 'sell'] as const).map((s) => [s, { c: 0, r: 0, e: 0, d: 0 }]));
  let totReal = 0; let totExp = 0; let totDelta = 0;
  for (const r of records) {
    totReal += r.realizedSlippageBps; totExp += r.expectedSlippageBps; totDelta += r.deltaSlippageBps;
    const t = tierAcc[r.stressTier]; t.c++; t.r += r.realizedSlippageBps; t.e += r.expectedSlippageBps; t.d += r.deltaSlippageBps;
    const s = sideAcc[r.side]; s.c++; s.r += r.realizedSlippageBps; s.e += r.expectedSlippageBps; s.d += r.deltaSlippageBps;
  }
  const finalize = (m: Record<string, { c: number; r: number; e: number; d: number }>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, {
      count: v.c, meanRealizedSlippageBps: v.c > 0 ? Number((v.r / v.c).toFixed(4)) : 0,
      meanExpectedSlippageBps: v.c > 0 ? Number((v.e / v.c).toFixed(4)) : 0,
      meanDeltaSlippageBps: v.c > 0 ? Number((v.d / v.c).toFixed(4)) : 0,
    }]));
  return {
    count, meanRealizedSlippageBps: count > 0 ? Number((totReal / count).toFixed(4)) : 0,
    meanExpectedSlippageBps: count > 0 ? Number((totExp / count).toFixed(4)) : 0,
    meanDeltaSlippageBps: count > 0 ? Number((totDelta / count).toFixed(4)) : 0,
    byStressTier: finalize(tierAcc) as unknown as Record<CostStressTier, SlippageAggregationSummary>,
    bySide: finalize(sideAcc) as unknown as Record<ShadowOrderSide, SlippageAggregationSummary>, records,
  };
}
