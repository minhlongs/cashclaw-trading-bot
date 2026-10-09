import { resolveStressConfig, type StressMode } from '../cost-stress';
import type { CostStressTier, OperationalTelemetry, ShadowFill, ShadowOrderSide } from './types';
import {
  evaluateOperationalTelemetryBatch,
  type OperationalTelemetryConfig,
  type OperationalTelemetrySummary,
  type OperationalAlarmType,
  type OperationalAlarm,
  type LatencyStats,
  type FreshnessStats,
  type ProviderStats,
  type ProviderProvenanceSummary,
} from './attribution-telemetry';
import type {
  EdgeAttributionParams,
  EdgeAttributionResult,
  EdgeAggregationSummary,
  BatchEdgeAttributionResult,
  SlippageAttributionResult,
  SlippageAggregationSummary,
  BatchSlippageAttributionResult,
} from './attribution-types';

export type {
  OperationalTelemetryConfig,
  OperationalTelemetrySummary,
  OperationalAlarmType,
  OperationalAlarm,
  LatencyStats,
  FreshnessStats,
  ProviderStats,
  ProviderProvenanceSummary,
  EdgeAttributionParams,
  EdgeAttributionResult,
  EdgeAggregationSummary,
  BatchEdgeAttributionResult,
  SlippageAttributionResult,
  SlippageAggregationSummary,
  BatchSlippageAttributionResult,
};
export { evaluateOperationalTelemetryBatch };

const round8 = (v: number): number => Number(v.toFixed(8));

function resolveRealizedNetReturn(p: EdgeAttributionParams): number {
  if (p.realizedNetReturn !== undefined) return p.realizedNetReturn;
  if (p.entryPrice === undefined || p.exitPrice === undefined) throw new Error('Must provide realizedNetReturn or entryPrice and exitPrice');
  const side = p.side ?? (p.record?.direction === 'sell' ? 'sell' : 'buy');
  const gross = side === 'sell' ? (p.entryPrice - p.exitPrice) / p.entryPrice : (p.exitPrice - p.entryPrice) / p.entryPrice;
  const feeRate = p.fillNotional && p.fillNotional > 0 && p.feeAmount !== undefined ? p.feeAmount / p.fillNotional : (p.feePct ?? 0);
  return gross - feeRate;
}

function computeSingleEdge(p: EdgeAttributionParams): EdgeAttributionResult {
  const expRet = p.expectedReturn ?? p.record?.expectedReturn;
  if (expRet === undefined) throw new Error('expectedReturn is required');
  const expCost = p.expectedCost ?? p.record?.expectedCost ?? 0;
  const expNet = round8(expRet - expCost);
  const realNet = round8(resolveRealizedNetReturn(p));
  return {
    alphaId: p.alphaId ?? p.record?.alphaId, regime: p.regime ?? p.record?.regime,
    expectedReturn: expRet, expectedCost: expCost, expectedNetReturn: expNet,
    realizedNetReturn: realNet, deltaEdge: round8(realNet - expNet),
  };
}

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

export function computeEdgeAttribution(p: EdgeAttributionParams): EdgeAttributionResult;
export function computeEdgeAttribution(p: readonly EdgeAttributionParams[]): BatchEdgeAttributionResult;
export function computeEdgeAttribution(p: EdgeAttributionParams | readonly EdgeAttributionParams[]): EdgeAttributionResult | BatchEdgeAttributionResult {
  return Array.isArray(p) ? computeBatchEdgeAttribution(p) : computeSingleEdge(p as EdgeAttributionParams);
}

function computeSingleSlippage(fill: ShadowFill, expectedOverride?: number): SlippageAttributionResult {
  const expBps = expectedOverride ?? resolveStressConfig(fill.stressTier as StressMode).slipPct * 10_000;
  return {
    fillId: fill.fillId, symbol: fill.symbol, side: fill.side, stressTier: fill.stressTier,
    realizedSlippageBps: fill.slippageBps, expectedSlippageBps: Number(expBps.toFixed(4)),
    deltaSlippageBps: Number((fill.slippageBps - expBps).toFixed(4)),
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

export function computeSlippageAttribution(f: ShadowFill, o?: number): SlippageAttributionResult;
export function computeSlippageAttribution(f: readonly ShadowFill[], o?: number): BatchSlippageAttributionResult;
export function computeSlippageAttribution(f: ShadowFill | readonly ShadowFill[], o?: number): SlippageAttributionResult | BatchSlippageAttributionResult {
  return Array.isArray(f) ? computeBatchSlippageAttribution(f, o) : computeSingleSlippage(f as ShadowFill, o);
}

export function evaluateOperationalTelemetry(telemetry: OperationalTelemetry, config?: OperationalTelemetryConfig): OperationalTelemetrySummary {
  return evaluateOperationalTelemetryBatch([telemetry], config);
}
