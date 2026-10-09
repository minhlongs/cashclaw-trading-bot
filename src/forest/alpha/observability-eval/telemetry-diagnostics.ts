import type { OperationalTelemetry } from '../../../tree/alpha/observability/types';
import type {
  FreshnessSummary,
  LatencySummary,
  ObservabilityEvalConfig,
  OperationalDiagnosticsSection,
  ProviderProvenanceSummary,
} from './types';
import { round4, computePercentiles, makeAlarm } from './telemetry-diagnostics-metrics';
import { evaluateSystemHealth, checkTelemetryAlarms } from './telemetry-health-evaluator';

export { round4, computePercentiles, makeAlarm, evaluateSystemHealth, checkTelemetryAlarms };

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
