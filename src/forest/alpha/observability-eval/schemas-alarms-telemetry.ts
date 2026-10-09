import { z } from 'zod';

export const ObservabilityAlarmTypeSchema = z.enum([
  'STALE_DATA',
  'HIGH_LATENCY',
  'PROVIDER_FALLBACK',
  'ADVERSE_SLIPPAGE',
  'EDGE_EROSION',
  'UNMATCHED_ORDER',
]);

export const ObservabilityAlarmSeveritySchema = z.enum(['INFO', 'WARN', 'CRITICAL']);

export const ObservabilityAlarmSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: ObservabilityAlarmTypeSchema,
  severity: ObservabilityAlarmSeveritySchema,
  message: z.string().trim().min(1).max(1000),
  timestamp: z.number().int().nonnegative(),
  metricValue: z.number().finite().optional(),
  thresholdValue: z.number().finite().optional(),
  context: z.record(z.string().min(1).max(100), z.unknown()).optional(),
}).strict();

export const LatencySummarySchema = z.object({
  count: z.number().int().nonnegative(),
  meanMs: z.number().finite().nonnegative(),
  medianMs: z.number().finite().nonnegative(),
  p95Ms: z.number().finite().nonnegative(),
  maxMs: z.number().finite().nonnegative(),
}).strict();

export const FreshnessSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  meanDriftMs: z.number().finite().nonnegative(),
  medianDriftMs: z.number().finite().nonnegative(),
  p95DriftMs: z.number().finite().nonnegative(),
  maxDriftMs: z.number().finite().nonnegative(),
  staleCount: z.number().int().nonnegative(),
}).strict();

export const ProviderProvenanceSummarySchema = z.object({
  totalAttempts: z.number().int().nonnegative(),
  primarySuccessCount: z.number().int().nonnegative(),
  primarySuccessRate: z.number().finite().min(0).max(1),
  fallbackCount: z.number().int().nonnegative(),
  fallbackRate: z.number().finite().min(0).max(1),
  byProvider: z.record(
    z.string().min(1).max(100),
    z.object({
      attempts: z.number().int().nonnegative(),
      successCount: z.number().int().nonnegative(),
      avgLatencyMs: z.number().finite().nonnegative().optional(),
    }).strict(),
  ),
}).strict();
