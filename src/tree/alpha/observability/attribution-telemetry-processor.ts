import type { OperationalTelemetry } from './types';
import type { OperationalAlarmType, OperationalAlarm } from './attribution-telemetry-types';

export interface ProviderAccumulator {
  attempts: number;
  successCount: number;
  sumLatency: number;
  latCount: number;
}

export function processTelemetryRecord(
  t: OperationalTelemetry,
  stalenessThreshold: number,
  latencyThreshold: number,
  alarms: OperationalAlarm[],
  alarmTypesSet: Set<OperationalAlarmType>,
  byProvider: Record<string, ProviderAccumulator>
): boolean {
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
  const isFallback = prov.usedFallback || prov.fallbackAttempts > 0;
  if (isFallback) {
    alarms.push({
      type: 'PROVIDER_FALLBACK',
      message: `Fallback used (attempts: ${prov.fallbackAttempts}, active: ${prov.activeProvider})`,
      timestamp: t.timestamp,
      metricValue: prov.fallbackAttempts,
    });
    alarmTypesSet.add('PROVIDER_FALLBACK');
  }
  const entry = byProvider[prov.activeProvider] ??= { attempts: 0, successCount: 0, sumLatency: 0, latCount: 0 };
  entry.attempts += prov.fallbackAttempts > 0 ? prov.fallbackAttempts : 1;
  entry.successCount++;
  if (prov.providerLatencyMs !== undefined) {
    entry.sumLatency += prov.providerLatencyMs;
    entry.latCount++;
  }
  return isFallback;
}
