import type { z } from 'zod';
import type {
  AlphaDecisionRecord,
  OperationalTelemetry,
  PortfolioDecisionRecord,
  ShadowFill,
  ShadowOrder,
} from '../../../tree/alpha/observability/types';
import type {
  AlphaEdgeAttributionSchema,
  FreshnessSummarySchema,
  LatencySummarySchema,
  ObservabilityAlarmSchema,
  ObservabilityAlarmSeveritySchema,
  ObservabilityAlarmTypeSchema,
  ObservabilityReportSchema,
  ProviderProvenanceSummarySchema,
  RegimeEdgeAttributionSchema,
  StressTierAttributionSchema,
} from './schemas';

export type ObservabilityAlarmType = z.infer<typeof ObservabilityAlarmTypeSchema>;
export type ObservabilityAlarmSeverity = z.infer<typeof ObservabilityAlarmSeveritySchema>;
export type ObservabilityAlarm = z.infer<typeof ObservabilityAlarmSchema>;
export type LatencySummary = z.infer<typeof LatencySummarySchema>;
export type FreshnessSummary = z.infer<typeof FreshnessSummarySchema>;
export type ProviderProvenanceSummary = z.infer<typeof ProviderProvenanceSummarySchema>;
export type AlphaEdgeAttribution = z.infer<typeof AlphaEdgeAttributionSchema>;
export type RegimeEdgeAttribution = z.infer<typeof RegimeEdgeAttributionSchema>;
export type StressTierAttribution = z.infer<typeof StressTierAttributionSchema>;
export type ObservabilityReport = z.infer<typeof ObservabilityReportSchema>;
export type ObservabilitySystemHealth = ObservabilityReport['systemHealth'];
export type ObservabilityHealthStatus = ObservabilityReport['systemHealth']['overallStatus'];
export type EdgeAttributionSection = ObservabilityReport['edgeAttribution'];
export type SlippageAttributionSection = ObservabilityReport['slippageAttribution'];
export type PortfolioDiagnosticsSection = ObservabilityReport['portfolioDiagnostics'];
export type OperationalDiagnosticsSection = ObservabilityReport['operationalDiagnostics'];

export interface ObservabilityEvalConfig {
  readonly reportId?: string;
  readonly latencyWarnThresholdMs?: number;
  readonly latencyCriticalThresholdMs?: number;
  readonly stalenessWarnThresholdMs?: number;
  readonly stalenessCriticalThresholdMs?: number;
  readonly slippageWarnThresholdBps?: number;
  readonly edgeErosionWarnThresholdBps?: number;
  readonly edgeErosionCriticalThresholdBps?: number;
  readonly fallbackErrorBudgetPct?: number;
}

export interface ObservabilityEvalInput {
  readonly alphaDecisions: readonly AlphaDecisionRecord[];
  readonly portfolioDecisions: readonly PortfolioDecisionRecord[];
  readonly shadowOrders: readonly ShadowOrder[];
  readonly shadowFills: readonly ShadowFill[];
  readonly operationalTelemetry: readonly OperationalTelemetry[];
  readonly realizedReturns?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  readonly config?: ObservabilityEvalConfig;
}
