import type { OperationalTelemetry, ShadowFill, ShadowOrder } from '../../../tree/alpha/observability/types';
import type {
  EdgeAttributionSection,
  ObservabilityAlarm,
  ObservabilityEvalConfig,
  ObservabilityHealthStatus,
  ObservabilitySystemHealth,
  OperationalDiagnosticsSection,
  SlippageAttributionSection,
} from './types';
import { round4, makeAlarm } from './telemetry-diagnostics-metrics';

export function checkTelemetryAlarms(
  telemetry: readonly OperationalTelemetry[],
  opDiag: OperationalDiagnosticsSection,
  cfg?: ObservabilityEvalConfig
): ObservabilityAlarm[] {
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
  const sWarn = config?.slippageWarnThresholdBps ?? 10;
  const eWarn = config?.edgeErosionWarnThresholdBps ?? 25;
  const eCrit = config?.edgeErosionCriticalThresholdBps ?? 50;

  if (slippage.slippageDeltaBpsMean > sWarn * 2) alarms.push(makeAlarm('ADVERSE_SLIPPAGE', 'CRITICAL', `Slippage delta ${slippage.slippageDeltaBpsMean}bps > critical`, now, slippage.slippageDeltaBpsMean, sWarn * 2));
  else if (slippage.slippageDeltaBpsMean > sWarn) alarms.push(makeAlarm('ADVERSE_SLIPPAGE', 'WARN', `Slippage delta ${slippage.slippageDeltaBpsMean}bps > warning`, now, slippage.slippageDeltaBpsMean, sWarn));

  if (edge.edgeErosionBps > eCrit) alarms.push(makeAlarm('EDGE_EROSION', 'CRITICAL', `Edge erosion ${edge.edgeErosionBps}bps > critical ${eCrit}bps`, now, edge.edgeErosionBps, eCrit));
  else if (edge.edgeErosionBps > eWarn) alarms.push(makeAlarm('EDGE_EROSION', 'WARN', `Edge erosion ${edge.edgeErosionBps}bps > warning ${eWarn}bps`, now, edge.edgeErosionBps, eWarn));

  const fillIds = new Set(fills.map((f) => f.orderId));
  for (const o of orders) {
    if (!fillIds.has(o.orderId)) alarms.push(makeAlarm('UNMATCHED_ORDER', 'WARN', `Shadow order ${o.orderId} (${o.symbol}) has no matching fill`, o.decisionTimestamp, undefined, undefined, { orderId: o.orderId, symbol: o.symbol }));
  }
  const orderIds = new Set(orders.map((o) => o.orderId));
  for (const f of fills) {
    if (!orderIds.has(f.orderId)) alarms.push(makeAlarm('UNMATCHED_ORDER', 'CRITICAL', `Shadow fill ${f.fillId} references non-existent order ${f.orderId}`, f.fillTimestamp, undefined, undefined, { fillId: f.fillId, orderId: f.orderId }));
  }

  const overallStatus: ObservabilityHealthStatus = alarms.some((a) => a.severity === 'CRITICAL') ? 'CRITICAL' : alarms.some((a) => a.severity === 'WARN') ? 'DEGRADED' : 'HEALTHY';
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
