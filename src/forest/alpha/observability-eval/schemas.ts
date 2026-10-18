import { z } from 'zod';
import {
  ObservabilityAlarmTypeSchema, ObservabilityAlarmSeveritySchema, ObservabilityAlarmSchema,
  LatencySummarySchema, FreshnessSummarySchema, ProviderProvenanceSummarySchema,
} from './schemas-alarms-telemetry';
import {
  AlphaEdgeAttributionSchema, RegimeEdgeAttributionSchema, StressTierAttributionSchema,
} from './schemas-attributions';

export {
  ObservabilityAlarmTypeSchema, ObservabilityAlarmSeveritySchema, ObservabilityAlarmSchema,
  LatencySummarySchema, FreshnessSummarySchema, ProviderProvenanceSummarySchema,
  AlphaEdgeAttributionSchema, RegimeEdgeAttributionSchema, StressTierAttributionSchema,
};

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
