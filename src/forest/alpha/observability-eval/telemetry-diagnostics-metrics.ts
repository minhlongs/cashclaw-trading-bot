import type {
  ObservabilityAlarm,
  ObservabilityAlarmSeverity,
  ObservabilityAlarmType,
} from './types';

export const round4 = (v: number): number => Number(v.toFixed(4));

export function computePercentiles(vals: readonly number[]) {
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

export function makeAlarm(
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
    type,
    severity,
    message,
    timestamp,
    ...(metricValue !== undefined ? { metricValue } : {}),
    ...(thresholdValue !== undefined ? { thresholdValue } : {}),
    ...(context ? { context } : {}),
  };
}
