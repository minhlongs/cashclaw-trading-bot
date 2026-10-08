import type { RegimeLabel } from '../../regime/types';
import { resolveStressConfig, type StressMode } from '../cost-stress';
import type { AlphaDecisionRecord, CostStressTier, OperationalTelemetry, ShadowFill, ShadowOrderSide } from './types';

export interface EdgeAttributionParams {
  readonly record?: AlphaDecisionRecord; readonly alphaId?: string; readonly regime?: RegimeLabel; readonly expectedReturn?: number; readonly expectedCost?: number; readonly realizedNetReturn?: number; readonly entryPrice?: number; readonly exitPrice?: number; readonly side?: ShadowOrderSide | 'hold'; readonly feeAmount?: number; readonly fillNotional?: number; readonly feePct?: number;
}
export interface EdgeAttributionResult {
  readonly alphaId?: string; readonly regime?: RegimeLabel; readonly expectedReturn: number; readonly expectedCost: number; readonly expectedNetReturn: number; readonly realizedNetReturn: number; readonly deltaEdge: number;
}
export interface EdgeAggregationSummary {
  readonly count: number; readonly meanExpectedNetReturn: number; readonly meanRealizedNetReturn: number; readonly meanDeltaEdge: number;
}
export interface BatchEdgeAttributionResult {
  readonly count: number; readonly meanExpectedNetReturn: number; readonly meanRealizedNetReturn: number; readonly meanDeltaEdge: number; readonly byAlphaId: Readonly<Record<string, EdgeAggregationSummary>>; readonly byRegime: Readonly<Record<string, EdgeAggregationSummary>>; readonly records: readonly EdgeAttributionResult[];
}
export interface SlippageAttributionResult {
  readonly fillId: string; readonly symbol: string; readonly side: ShadowOrderSide; readonly stressTier: CostStressTier; readonly realizedSlippageBps: number; readonly expectedSlippageBps: number; readonly deltaSlippageBps: number;
}
export interface SlippageAggregationSummary {
  readonly count: number; readonly meanRealizedSlippageBps: number; readonly meanExpectedSlippageBps: number; readonly meanDeltaSlippageBps: number;
}
export interface BatchSlippageAttributionResult {
  readonly count: number; readonly meanRealizedSlippageBps: number; readonly meanExpectedSlippageBps: number; readonly meanDeltaSlippageBps: number; readonly byStressTier: Readonly<Record<CostStressTier, SlippageAggregationSummary>>; readonly bySide: Readonly<Record<ShadowOrderSide, SlippageAggregationSummary>>; readonly records: readonly SlippageAttributionResult[];
}
export interface OperationalTelemetryConfig { readonly stalenessThresholdMs?: number; readonly latencyThresholdMs?: number; }
export type OperationalAlarmType = 'STALE_DATA' | 'HIGH_LATENCY' | 'PROVIDER_FALLBACK';
export interface OperationalAlarm { readonly type: OperationalAlarmType; readonly message: string; readonly timestamp?: number; readonly metricValue?: number; readonly thresholdValue?: number; }
export interface LatencyStats {
  readonly count: number; readonly mean: number; readonly meanMs: number; readonly median: number; readonly medianMs: number; readonly p95: number; readonly p95Ms: number; readonly max: number; readonly maxMs: number;
}
export interface FreshnessStats {
  readonly count: number; readonly mean: number; readonly meanDriftMs: number; readonly median: number; readonly medianDriftMs: number; readonly p95: number; readonly p95DriftMs: number; readonly max: number; readonly maxDriftMs: number; readonly staleCount: number;
}
export interface ProviderStats { readonly attempts: number; readonly successCount: number; readonly avgLatencyMs?: number; }
export interface ProviderProvenanceSummary {
  readonly totalAttempts: number; readonly primarySuccessCount: number; readonly primarySuccessRate: number; readonly fallbackCount: number; readonly fallbackRate: number; readonly byProvider: Readonly<Record<string, ProviderStats>>;
}
export interface OperationalTelemetrySummary {
  readonly count: number; readonly latency: LatencyStats; readonly freshness: FreshnessStats; readonly alarms: readonly OperationalAlarm[]; readonly alarmTypes: readonly OperationalAlarmType[]; readonly provenance: ProviderProvenanceSummary;
}

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

function computeDistributionStats(vals: readonly number[]) {
  const count = vals.length;
  if (count === 0) return { count: 0, mean: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95 = sorted[Math.max(0, Math.min(count - 1, Math.ceil(0.95 * count) - 1))];
  return { count, mean: Number((sorted.reduce((a, b) => a + b, 0) / count).toFixed(4)), median, p95, max: sorted[count - 1] };
}

export function evaluateOperationalTelemetryBatch(
  telemetry: readonly OperationalTelemetry[], config?: OperationalTelemetryConfig,
): OperationalTelemetrySummary {
  const count = telemetry.length;
  const stalenessThreshold = config?.stalenessThresholdMs ?? 5000;
  const latencyThreshold = config?.latencyThresholdMs ?? 100;
  const latStats = computeDistributionStats(telemetry.map((t) => t.decisionLatencyMs));
  const freshStats = computeDistributionStats(telemetry.map((t) => t.dataFreshnessMs));
  const alarms: OperationalAlarm[] = [];
  const alarmTypesSet = new Set<OperationalAlarmType>();
  let primarySuccessCount = 0; let fallbackCount = 0;
  const byProvider: Record<string, { attempts: number; successCount: number; sumLatency: number; latCount: number }> = {};
  for (const t of telemetry) {
    if (t.dataFreshnessMs > stalenessThreshold) {
      alarms.push({ type: 'STALE_DATA', message: `Freshness drift ${t.dataFreshnessMs}ms > ${stalenessThreshold}ms`, timestamp: t.timestamp, metricValue: t.dataFreshnessMs, thresholdValue: stalenessThreshold });
      alarmTypesSet.add('STALE_DATA');
    }
    if (t.decisionLatencyMs > latencyThreshold) {
      alarms.push({ type: 'HIGH_LATENCY', message: `Decision latency ${t.decisionLatencyMs}ms > ${latencyThreshold}ms`, timestamp: t.timestamp, metricValue: t.decisionLatencyMs, thresholdValue: latencyThreshold });
      alarmTypesSet.add('HIGH_LATENCY');
    }
    const prov = t.providerProvenance;
    if (prov.usedFallback || prov.fallbackAttempts > 0) {
      alarms.push({ type: 'PROVIDER_FALLBACK', message: `Fallback used (attempts: ${prov.fallbackAttempts}, active: ${prov.activeProvider})`, timestamp: t.timestamp, metricValue: prov.fallbackAttempts });
      alarmTypesSet.add('PROVIDER_FALLBACK');
      fallbackCount++;
    } else { primarySuccessCount++; }
    const entry = byProvider[prov.activeProvider] ??= { attempts: 0, successCount: 0, sumLatency: 0, latCount: 0 };
    entry.attempts += (prov.fallbackAttempts > 0 ? prov.fallbackAttempts : 1);
    entry.successCount++;
    if (prov.providerLatencyMs !== undefined) { entry.sumLatency += prov.providerLatencyMs; entry.latCount++; }
  }
  return {
    count,
    latency: { ...latStats, meanMs: latStats.mean, medianMs: latStats.median, p95Ms: latStats.p95, maxMs: latStats.max },
    freshness: { ...freshStats, meanDriftMs: freshStats.mean, medianDriftMs: freshStats.median, p95DriftMs: freshStats.p95, maxDriftMs: freshStats.max, staleCount: telemetry.filter((t) => t.dataFreshnessMs > stalenessThreshold).length },
    alarms, alarmTypes: Array.from(alarmTypesSet),
    provenance: {
      totalAttempts: count, primarySuccessCount,
      primarySuccessRate: count > 0 ? Number((primarySuccessCount / count).toFixed(4)) : 1,
      fallbackCount, fallbackRate: count > 0 ? Number((fallbackCount / count).toFixed(4)) : 0,
      byProvider: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, {
        attempts: v.attempts, successCount: v.successCount, ...(v.latCount > 0 ? { avgLatencyMs: Number((v.sumLatency / v.latCount).toFixed(2)) } : {}),
      }])),
    },
  };
}

export function evaluateOperationalTelemetry(telemetry: OperationalTelemetry, config?: OperationalTelemetryConfig): OperationalTelemetrySummary {
  return evaluateOperationalTelemetryBatch([telemetry], config);
}
