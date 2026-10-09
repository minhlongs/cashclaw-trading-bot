import type { OperationalTelemetry } from './types';
import type {
  OperationalTelemetryConfig,
  OperationalAlarmType,
  OperationalAlarm,
  OperationalTelemetrySummary,
} from './attribution-telemetry-types';

export * from './attribution-telemetry-types';

export function computeDistributionStats(vals: readonly number[]) {
  const count = vals.length;
  if (count === 0) return { count: 0, mean: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const p95 = sorted[Math.max(0, Math.min(count - 1, Math.ceil(0.95 * count) - 1))]!;
  return {
    count,
    mean: Number((sorted.reduce((a, b) => a + b, 0) / count).toFixed(4)),
    median,
    p95,
    max: sorted[count - 1]!,
  };
}

export function evaluateOperationalTelemetryBatch(
  telemetry: readonly OperationalTelemetry[],
  config?: OperationalTelemetryConfig
): OperationalTelemetrySummary {
  const count = telemetry.length;
  const stalenessThreshold = config?.stalenessThresholdMs ?? 5000;
  const latencyThreshold = config?.latencyThresholdMs ?? 100;
  const latStats = computeDistributionStats(telemetry.map((t) => t.decisionLatencyMs));
  const freshStats = computeDistributionStats(telemetry.map((t) => t.dataFreshnessMs));
  const alarms: OperationalAlarm[] = [];
  const alarmTypesSet = new Set<OperationalAlarmType>();
  let primarySuccessCount = 0;
  let fallbackCount = 0;
  const byProvider: Record<string, { attempts: number; successCount: number; sumLatency: number; latCount: number }> = {};

  for (const t of telemetry) {
    if (t.dataFreshnessMs > stalenessThreshold) {
      alarms.push({
        type: 'STALE_DATA',
        message: `Freshness drift ${t.dataFreshnessMs}ms > ${stalenessThreshold}ms`,
        timestamp: t.timestamp,
        metricValue: t.dataFreshnessMs,
        thresholdValue: stalenessThreshold,
      });
      alarmTypesSet.add('STALE_DATA');
    }
    if (t.decisionLatencyMs > latencyThreshold) {
      alarms.push({
        type: 'HIGH_LATENCY',
        message: `Decision latency ${t.decisionLatencyMs}ms > ${latencyThreshold}ms`,
        timestamp: t.timestamp,
        metricValue: t.decisionLatencyMs,
        thresholdValue: latencyThreshold,
      });
      alarmTypesSet.add('HIGH_LATENCY');
    }
    const prov = t.providerProvenance;
    if (prov.usedFallback || prov.fallbackAttempts > 0) {
      alarms.push({
        type: 'PROVIDER_FALLBACK',
        message: `Fallback used (attempts: ${prov.fallbackAttempts}, active: ${prov.activeProvider})`,
        timestamp: t.timestamp,
        metricValue: prov.fallbackAttempts,
      });
      alarmTypesSet.add('PROVIDER_FALLBACK');
      fallbackCount++;
    } else {
      primarySuccessCount++;
    }
    const entry = byProvider[prov.activeProvider] ??= { attempts: 0, successCount: 0, sumLatency: 0, latCount: 0 };
    entry.attempts += prov.fallbackAttempts > 0 ? prov.fallbackAttempts : 1;
    entry.successCount++;
    if (prov.providerLatencyMs !== undefined) {
      entry.sumLatency += prov.providerLatencyMs;
      entry.latCount++;
    }
  }

  return {
    count,
    latency: { ...latStats, meanMs: latStats.mean, medianMs: latStats.median, p95Ms: latStats.p95, maxMs: latStats.max },
    freshness: {
      ...freshStats,
      meanDriftMs: freshStats.mean,
      medianDriftMs: freshStats.median,
      p95DriftMs: freshStats.p95,
      maxDriftMs: freshStats.max,
      staleCount: telemetry.filter((t) => t.dataFreshnessMs > stalenessThreshold).length,
    },
    alarms,
    alarmTypes: Array.from(alarmTypesSet),
    provenance: {
      totalAttempts: count,
      primarySuccessCount,
      primarySuccessRate: count > 0 ? Number((primarySuccessCount / count).toFixed(4)) : 1,
      fallbackCount,
      fallbackRate: count > 0 ? Number((fallbackCount / count).toFixed(4)) : 0,
      byProvider: Object.fromEntries(
        Object.entries(byProvider).map(([k, v]) => [
          k,
          {
            attempts: v.attempts,
            successCount: v.successCount,
            ...(v.latCount > 0 ? { avgLatencyMs: Number((v.sumLatency / v.latCount).toFixed(2)) } : {}),
          },
        ])
      ),
    },
  };
}
