export interface OperationalTelemetryConfig {
  readonly stalenessThresholdMs?: number;
  readonly latencyThresholdMs?: number;
}

export type OperationalAlarmType = 'STALE_DATA' | 'HIGH_LATENCY' | 'PROVIDER_FALLBACK';

export interface OperationalAlarm {
  readonly type: OperationalAlarmType;
  readonly message: string;
  readonly timestamp?: number;
  readonly metricValue?: number;
  readonly thresholdValue?: number;
}

export interface LatencyStats {
  readonly count: number;
  readonly mean: number;
  readonly meanMs: number;
  readonly median: number;
  readonly medianMs: number;
  readonly p95: number;
  readonly p95Ms: number;
  readonly max: number;
  readonly maxMs: number;
}

export interface FreshnessStats {
  readonly count: number;
  readonly mean: number;
  readonly meanDriftMs: number;
  readonly median: number;
  readonly medianDriftMs: number;
  readonly p95: number;
  readonly p95DriftMs: number;
  readonly max: number;
  readonly maxDriftMs: number;
  readonly staleCount: number;
}

export interface ProviderStats {
  readonly attempts: number;
  readonly successCount: number;
  readonly avgLatencyMs?: number;
}

export interface ProviderProvenanceSummary {
  readonly totalAttempts: number;
  readonly primarySuccessCount: number;
  readonly primarySuccessRate: number;
  readonly fallbackCount: number;
  readonly fallbackRate: number;
  readonly byProvider: Readonly<Record<string, ProviderStats>>;
}

export interface OperationalTelemetrySummary {
  readonly count: number;
  readonly latency: LatencyStats;
  readonly freshness: FreshnessStats;
  readonly alarms: readonly OperationalAlarm[];
  readonly alarmTypes: readonly OperationalAlarmType[];
  readonly provenance: ProviderProvenanceSummary;
}
