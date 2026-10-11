import { computeEdgeDiagnostics } from './edge-diagnostics';
import { ObservabilityReportSchema } from './schemas';
import { computeSlippageDiagnostics } from './slippage-diagnostics';
import { computeOperationalDiagnostics, evaluateSystemHealth } from './telemetry-diagnostics';
import { computeObservabilityTimeRange } from './evaluate-time';
import { computePortfolioDiagnostics } from './evaluate-portfolio';
import type { ObservabilityEvalInput, ObservabilityReport } from './types';

export function evaluateObservability(input: ObservabilityEvalInput): ObservabilityReport {
  const generatedAt = Date.now(), reportId = input.config?.reportId ?? `report-obs-${generatedAt}-${Math.random().toString(36).slice(2, 7)}`;
  const timeRange = computeObservabilityTimeRange(input, generatedAt);
  const sampleCounts = { alphaDecisions: input.alphaDecisions.length, portfolioDecisions: input.portfolioDecisions.length, shadowOrders: input.shadowOrders.length, shadowFills: input.shadowFills.length, operationalTelemetry: input.operationalTelemetry.length };
  const edgeAttribution = computeEdgeDiagnostics(input.alphaDecisions, input.realizedReturns), slippageAttribution = computeSlippageDiagnostics(input.shadowOrders, input.shadowFills);
  const operationalDiagnostics = computeOperationalDiagnostics(input.operationalTelemetry, input.config), portfolioDiagnostics = computePortfolioDiagnostics(input.portfolioDecisions);
  const systemHealth = evaluateSystemHealth(input.operationalTelemetry, operationalDiagnostics, edgeAttribution, slippageAttribution, input.shadowOrders, input.shadowFills, input.config);
  const hashSet = new Set(input.alphaDecisions.map((d) => d.featureSnapshotHash)), depSet = new Set<string>();
  for (const d of input.alphaDecisions) for (const dep of d.featureDependencies) depSet.add(dep);
  const featureSnapshotProvenance = { uniqueHashCount: hashSet.size, featureDependencies: Array.from(depSet).sort() };
  return ObservabilityReportSchema.parse({ reportId, generatedAt, timeRange, sampleCounts, edgeAttribution, slippageAttribution, portfolioDiagnostics, operationalDiagnostics, systemHealth, featureSnapshotProvenance });
}
