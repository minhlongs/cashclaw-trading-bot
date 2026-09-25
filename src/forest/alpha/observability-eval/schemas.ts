import { z } from 'zod';
import { RegimeLabel } from '../../../tree/regime/types';

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

export const AlphaEdgeAttributionSchema = z.object({
  alphaId: z.string().trim().min(1).max(100),
  decisionCount: z.number().int().nonnegative(),
  expectedNetReturnMean: z.number().finite(),
  realizedNetReturnMean: z.number().finite(),
  edgeDeltaMean: z.number().finite(),
  winRate: z.number().finite().min(0).max(1),
  sharpe: z.number().finite().nullable().optional(),
}).strict();

export const RegimeEdgeAttributionSchema = z.object({
  regime: z.nativeEnum(RegimeLabel),
  decisionCount: z.number().int().nonnegative(),
  expectedNetReturnMean: z.number().finite(),
  realizedNetReturnMean: z.number().finite(),
  edgeDeltaMean: z.number().finite(),
}).strict();

export const StressTierAttributionSchema = z.object({
  stressTier: z.string().trim().min(1).max(50),
  orderCount: z.number().int().nonnegative(),
  fillCount: z.number().int().nonnegative(),
  fillRate: z.number().finite().min(0).max(1),
  expectedSlippageBpsMean: z.number().finite(),
  realizedSlippageBpsMean: z.number().finite(),
  slippageDeltaBpsMean: z.number().finite(),
  totalFees: z.number().finite().nonnegative(),
}).strict();

export const ObservabilityReportSchema = z.object({
  reportId: z.string().trim().min(1).max(100),
  generatedAt: z.number().int().nonnegative(),
  timeRange: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  }).strict(),
  sampleCounts: z.object({
    alphaDecisions: z.number().int().nonnegative(),
    portfolioDecisions: z.number().int().nonnegative(),
    shadowOrders: z.number().int().nonnegative(),
    shadowFills: z.number().int().nonnegative(),
    operationalTelemetry: z.number().int().nonnegative(),
  }).strict(),
  edgeAttribution: z.object({
    expectedNetReturnMean: z.number().finite(),
    realizedNetReturnMean: z.number().finite(),
    edgeDeltaMean: z.number().finite(),
    edgeErosionBps: z.number().finite(),
    byAlpha: z.record(z.string().min(1).max(100), AlphaEdgeAttributionSchema),
    byRegime: z.record(z.string().min(1).max(50), RegimeEdgeAttributionSchema),
  }).strict(),
  slippageAttribution: z.object({
    expectedSlippageBpsMean: z.number().finite(),
    realizedSlippageBpsMean: z.number().finite(),
    slippageDeltaBpsMean: z.number().finite(),
    totalFees: z.number().finite().nonnegative(),
    effectiveCostBps: z.number().finite(),
    byStressTier: z.record(z.string().min(1).max(50), StressTierAttributionSchema),
    bySide: z.object({
      buy: z.object({
        orderCount: z.number().int().nonnegative(),
        fillCount: z.number().int().nonnegative(),
        realizedSlippageBpsMean: z.number().finite(),
      }).strict(),
      sell: z.object({
        orderCount: z.number().int().nonnegative(),
        fillCount: z.number().int().nonnegative(),
        realizedSlippageBpsMean: z.number().finite(),
      }).strict(),
    }).strict(),
  }).strict(),
  portfolioDiagnostics: z.object({
    meanGrossExposure: z.number().finite().nonnegative(),
    meanNetExposure: z.number().finite(),
    meanVolTargetingScale: z.number().finite().nonnegative(),
    totalTurnover: z.number().finite().nonnegative(),
    activeRiskOverlayTriggers: z.record(z.string().min(1).max(100), z.number().int().nonnegative()),
  }).strict(),
  operationalDiagnostics: z.object({
    latency: LatencySummarySchema,
    freshness: FreshnessSummarySchema,
    provenance: ProviderProvenanceSummarySchema,
  }).strict(),
  systemHealth: z.object({
    overallStatus: z.enum(['HEALTHY', 'DEGRADED', 'CRITICAL']),
    alarms: z.array(ObservabilityAlarmSchema),
    alarmCounts: z.object({
      staleData: z.number().int().nonnegative(),
      highLatency: z.number().int().nonnegative(),
      providerFallback: z.number().int().nonnegative(),
      adverseSlippage: z.number().int().nonnegative(),
      edgeErosion: z.number().int().nonnegative(),
      unmatchedOrder: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  featureSnapshotProvenance: z.object({
    uniqueHashCount: z.number().int().nonnegative(),
    featureDependencies: z.array(z.string().min(1).max(100)),
  }).strict(),
}).strict();
