import type { OperationalTelemetry } from './types';
import type {
  OperationalTelemetryConfig,
  OperationalAlarmType,
  OperationalAlarm,
  OperationalTelemetrySummary,
} from './attribution-telemetry-types';
import { computeDistributionStats } from './attribution-telemetry-stats';
import { processTelemetryRecord, type ProviderAccumulator } from './attribution-telemetry-processor';

export * from './attribution-telemetry-types';
export * from './attribution-telemetry-stats';
export * from './attribution-telemetry-processor';

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
  let fallbackCount = 0;
  const byProvider: Record<string, ProviderAccumulator> = {};

  for (const t of telemetry) {
    if (processTelemetryRecord(t, stalenessThreshold, latencyThreshold, alarms, alarmTypesSet, byProvider)) {
      fallbackCount++;
    }
  }
  const primarySuccessCount = count - fallbackCount;

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
