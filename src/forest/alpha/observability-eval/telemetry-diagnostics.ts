import type { OperationalTelemetry, ShadowFill, ShadowOrder } from '../../../tree/alpha/observability/types';
import type {
  EdgeAttributionSection,
  FreshnessSummary,
  LatencySummary,
  ObservabilityAlarm,
  ObservabilityAlarmSeverity,
  ObservabilityAlarmType,
  ObservabilityEvalConfig,
  ObservabilityHealthStatus,
  ObservabilitySystemHealth,
  OperationalDiagnosticsSection,
  ProviderProvenanceSummary,
  SlippageAttributionSection,
} from './types';

const round4 = (v: number): number => Number(v.toFixed(4));

function computePercentiles(vals: readonly number[]) {
  const count = vals.length;
  if (count === 0) return { count: 0, meanMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const p95Idx = Math.max(0, Math.min(count - 1, Math.ceil(0.95 * count) - 1));
  return {
    count,
    meanMs: round4(sorted.reduce((acc, v) => acc + v, 0) / count),
    medianMs: round4(median),
    p95Ms: round4(sorted[p95Idx]!),
    maxMs: round4(sorted[count - 1]!),
  };
}

export function computeOperationalDiagnostics(
  telemetry: readonly OperationalTelemetry[],
  config?: ObservabilityEvalConfig,
): OperationalDiagnosticsSection {
  const count = telemetry.length;
  const stalenessWarn = config?.stalenessWarnThresholdMs ?? 2000;
  const latPerc = computePercentiles(telemetry.map((t) => t.decisionLatencyMs));
  const freshPerc = computePercentiles(telemetry.map((t) => t.dataFreshnessMs));
  const staleCount = telemetry.filter((t) => t.dataFreshnessMs > stalenessWarn).length;

  let primarySuccessCount = 0;
  let fallbackCount = 0;
  const byProvider: Record<string, { attempts: number; successCount: number; sumLat: number; latCount: number }> = {};

  for (const t of telemetry) {
    const prov = t.providerProvenance;
    if (prov.usedFallback || prov.fallbackAttempts > 0) fallbackCount++;
    else primarySuccessCount++;
    const entry = (byProvider[prov.activeProvider] ??= { attempts: 0, successCount: 0, sumLat: 0, latCount: 0 });
    entry.attempts += Math.max(1, prov.fallbackAttempts);
    entry.successCount++;
    if (prov.providerLatencyMs !== undefined) {
      entry.sumLat += prov.providerLatencyMs;
      entry.latCount++;
    }
  }

  const provenance: ProviderProvenanceSummary = {
    totalAttempts: count,
    primarySuccessCount,
    primarySuccessRate: count > 0 ? round4(primarySuccessCount / count) : 1,
    fallbackCount,
    fallbackRate: count > 0 ? round4(fallbackCount / count) : 0,
    byProvider: Object.fromEntries(
      Object.entries(byProvider).map(([k, v]) => [
        k,
        { attempts: v.attempts, successCount: v.successCount, ...(v.latCount > 0 ? { avgLatencyMs: round4(v.sumLat / v.latCount) } : {}) },
      ]),
    ),
  };

  const latency: LatencySummary = latPerc;
  const freshness: FreshnessSummary = {
    count,
    meanDriftMs: freshPerc.meanMs,
    medianDriftMs: freshPerc.medianMs,
    p95DriftMs: freshPerc.p95Ms,
    maxDriftMs: freshPerc.maxMs,
    staleCount,
  };

  return { latency, freshness, provenance };
}

function makeAlarm(
  type: ObservabilityAlarmType,
  severity: ObservabilityAlarmSeverity,
  message: string,
  timestamp: number,
  metricValue?: number,
  thresholdValue?: number,
  context?: Record<string, unknown>,
): ObservabilityAlarm {
  return {
    id: `alarm-${type.toLowerCase()}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    type, severity, message, timestamp,
    ...(metricValue !== undefined ? { metricValue } : {}),
    ...(thresholdValue !== undefined ? { thresholdValue } : {}),
    ...(context ? { context } : {}),
  };
}

function checkTelemetryAlarms(telemetry: readonly OperationalTelemetry[], opDiag: OperationalDiagnosticsSection, cfg?: ObservabilityEvalConfig): ObservabilityAlarm[] {
  const alarms: ObservabilityAlarm[] = [];
  const now = Date.now();
  const sWarn = cfg?.stalenessWarnThresholdMs ?? 2000;
  const sCrit = cfg?.stalenessCriticalThresholdMs ?? 5000;
  const lWarn = cfg?.latencyWarnThresholdMs ?? 100;
  const lCrit = cfg?.latencyCriticalThresholdMs ?? 500;
  const fbBudget = cfg?.fallbackErrorBudgetPct ?? 0.05;

  for (const t of telemetry) {
    const ts = t.timestamp ?? now;
    if (t.dataFreshnessMs > sCrit) alarms.push(makeAlarm('STALE_DATA', 'CRITICAL', `Freshness drift ${t.dataFreshnessMs}ms > ${sCrit}ms`, ts, t.dataFreshnessMs, sCrit));
    else if (t.dataFreshnessMs > sWarn) alarms.push(makeAlarm('STALE_DATA', 'WARN', `Freshness drift ${t.dataFreshnessMs}ms > ${sWarn}ms`, ts, t.dataFreshnessMs, sWarn));
  }
  if (opDiag.latency.maxMs > lCrit) alarms.push(makeAlarm('HIGH_LATENCY', 'CRITICAL', `Max latency ${opDiag.latency.maxMs}ms > ${lCrit}ms`, now, opDiag.latency.maxMs, lCrit));
  else if (opDiag.latency.p95Ms > lWarn) alarms.push(makeAlarm('HIGH_LATENCY', 'WARN', `p95 latency ${opDiag.latency.p95Ms}ms > ${lWarn}ms`, now, opDiag.latency.p95Ms, lWarn));
  if (opDiag.provenance.fallbackRate > fbBudget) alarms.push(makeAlarm('PROVIDER_FALLBACK', 'CRITICAL', `Fallback rate ${round4(opDiag.provenance.fallbackRate * 100)}% > budget ${fbBudget * 100}%`, now, opDiag.provenance.fallbackRate, fbBudget));
  else if (opDiag.provenance.fallbackCount > 0) alarms.push(makeAlarm('PROVIDER_FALLBACK', 'WARN', `${opDiag.provenance.fallbackCount} provider fallback event(s)`, now, opDiag.provenance.fallbackCount));

  return alarms;
}

export function evaluateSystemHealth(
  telemetry: readonly OperationalTelemetry[],
  opDiag: OperationalDiagnosticsSection,
  edge: EdgeAttributionSection,
  slippage: SlippageAttributionSection,
  orders: readonly ShadowOrder[],
  fills: readonly ShadowFill[],
  config?: ObservabilityEvalConfig,
): ObservabilitySystemHealth {
  const alarms = checkTelemetryAlarms(telemetry, opDiag, config);
  const now = Date.now();
  const slipWarn = config?.slippageWarnThresholdBps ?? 10;
  const edgeWarn = config?.edgeErosionWarnThresholdBps ?? 25;
  const edgeCrit = config?.edgeErosionCriticalThresholdBps ?? 50;

  if (slippage.slippageDeltaBpsMean > slipWarn * 2) alarms.push(makeAlarm('ADVERSE_SLIPPAGE', 'CRITICAL', `Slippage delta ${slippage.slippageDeltaBpsMean}bps > critical`, now, slippage.slippageDeltaBpsMean, slipWarn * 2));
  else if (slippage.slippageDeltaBpsMean > slipWarn) alarms.push(makeAlarm('ADVERSE_SLIPPAGE', 'WARN', `Slippage delta ${slippage.slippageDeltaBpsMean}bps > warning`, now, slippage.slippageDeltaBpsMean, slipWarn));

  if (edge.edgeErosionBps > edgeCrit) alarms.push(makeAlarm('EDGE_EROSION', 'CRITICAL', `Edge erosion ${edge.edgeErosionBps}bps > critical ${edgeCrit}bps`, now, edge.edgeErosionBps, edgeCrit));
  else if (edge.edgeErosionBps > edgeWarn) alarms.push(makeAlarm('EDGE_EROSION', 'WARN', `Edge erosion ${edge.edgeErosionBps}bps > warning ${edgeWarn}bps`, now, edge.edgeErosionBps, edgeWarn));

  const fillOrderIds = new Set(fills.map((f) => f.orderId));
  for (const o of orders) {
    if (!fillOrderIds.has(o.orderId)) alarms.push(makeAlarm('UNMATCHED_ORDER', 'WARN', `Shadow order ${o.orderId} (${o.symbol}) has no matching fill`, o.decisionTimestamp, undefined, undefined, { orderId: o.orderId, symbol: o.symbol }));
  }
  const orderOrderIds = new Set(orders.map((o) => o.orderId));
  for (const f of fills) {
    if (!orderOrderIds.has(f.orderId)) alarms.push(makeAlarm('UNMATCHED_ORDER', 'CRITICAL', `Shadow fill ${f.fillId} references non-existent order ${f.orderId}`, f.fillTimestamp, undefined, undefined, { fillId: f.fillId, orderId: f.orderId }));
  }

  const overallStatus: ObservabilityHealthStatus = alarms.some((a) => a.severity === 'CRITICAL')
    ? 'CRITICAL'
    : alarms.some((a) => a.severity === 'WARN')
      ? 'DEGRADED'
      : 'HEALTHY';

  const alarmCounts = {
    staleData: alarms.filter((a) => a.type === 'STALE_DATA').length,
    highLatency: alarms.filter((a) => a.type === 'HIGH_LATENCY').length,
    providerFallback: alarms.filter((a) => a.type === 'PROVIDER_FALLBACK').length,
    adverseSlippage: alarms.filter((a) => a.type === 'ADVERSE_SLIPPAGE').length,
    edgeErosion: alarms.filter((a) => a.type === 'EDGE_EROSION').length,
    unmatchedOrder: alarms.filter((a) => a.type === 'UNMATCHED_ORDER').length,
  };

  return { overallStatus, alarms, alarmCounts };
}
