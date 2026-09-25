import type { PortfolioDecisionRecord } from '../../../tree/alpha/observability/types';
import { computeEdgeDiagnostics } from './edge-diagnostics';
import { ObservabilityReportSchema } from './schemas';
import { computeSlippageDiagnostics } from './slippage-diagnostics';
import {
  computeOperationalDiagnostics,
  evaluateSystemHealth,
} from './telemetry-diagnostics';
import type {
  ObservabilityEvalInput,
  ObservabilityReport,
  PortfolioDiagnosticsSection,
} from './types';

const round4 = (v: number): number => Number(v.toFixed(4));

function computeTimeRange(input: ObservabilityEvalInput, now: number) {
  const tsList: number[] = [];
  for (const a of input.alphaDecisions) tsList.push(a.timestamp);
  for (const p of input.portfolioDecisions) tsList.push(p.timestamp);
  for (const o of input.shadowOrders) tsList.push(o.decisionTimestamp);
  for (const f of input.shadowFills) tsList.push(f.fillTimestamp);
  for (const t of input.operationalTelemetry) {
    if (t.timestamp !== undefined) tsList.push(t.timestamp);
  }

  if (tsList.length === 0) return { start: now, end: now };
  return { start: Math.min(...tsList), end: Math.max(...tsList) };
}

function computePortfolioDiagnostics(records: readonly PortfolioDecisionRecord[]): PortfolioDiagnosticsSection {
  const count = records.length;
  if (count === 0) {
    return {
      meanGrossExposure: 0,
      meanNetExposure: 0,
      meanVolTargetingScale: 0,
      totalTurnover: 0,
      activeRiskOverlayTriggers: {},
    };
  }

  const grossSum = records.reduce((acc, p) => acc + p.grossExposure, 0);
  const netSum = records.reduce((acc, p) => acc + p.netExposure, 0);
  const volSum = records.reduce((acc, p) => acc + p.volTargetingScale, 0);
  const turnoverSum = records.reduce((acc, p) => acc + (p.totalTurnover ?? 0), 0);

  const activeRiskOverlayTriggers: Record<string, number> = {};
  for (const p of records) {
    for (const adj of p.activeRiskOverlayAdjustments) {
      activeRiskOverlayTriggers[adj] = (activeRiskOverlayTriggers[adj] ?? 0) + 1;
    }
  }

  return {
    meanGrossExposure: round4(grossSum / count),
    meanNetExposure: round4(netSum / count),
    meanVolTargetingScale: round4(volSum / count),
    totalTurnover: round4(turnoverSum),
    activeRiskOverlayTriggers,
  };
}

export function evaluateObservability(input: ObservabilityEvalInput): ObservabilityReport {
  const generatedAt = Date.now();
  const reportId = input.config?.reportId ?? `report-obs-${generatedAt}-${Math.random().toString(36).slice(2, 7)}`;
  const timeRange = computeTimeRange(input, generatedAt);

  const sampleCounts = {
    alphaDecisions: input.alphaDecisions.length,
    portfolioDecisions: input.portfolioDecisions.length,
    shadowOrders: input.shadowOrders.length,
    shadowFills: input.shadowFills.length,
    operationalTelemetry: input.operationalTelemetry.length,
  };

  const edgeAttribution = computeEdgeDiagnostics(input.alphaDecisions, input.realizedReturns);
  const slippageAttribution = computeSlippageDiagnostics(input.shadowOrders, input.shadowFills);
  const operationalDiagnostics = computeOperationalDiagnostics(input.operationalTelemetry, input.config);
  const portfolioDiagnostics = computePortfolioDiagnostics(input.portfolioDecisions);

  const systemHealth = evaluateSystemHealth(
    input.operationalTelemetry,
    operationalDiagnostics,
    edgeAttribution,
    slippageAttribution,
    input.shadowOrders,
    input.shadowFills,
    input.config,
  );

  const hashSet = new Set(input.alphaDecisions.map((d) => d.featureSnapshotHash));
  const depSet = new Set<string>();
  for (const d of input.alphaDecisions) {
    for (const dep of d.featureDependencies) depSet.add(dep);
  }

  const featureSnapshotProvenance = {
    uniqueHashCount: hashSet.size,
    featureDependencies: Array.from(depSet).sort(),
  };

  const report = {
    reportId,
    generatedAt,
    timeRange,
    sampleCounts,
    edgeAttribution,
    slippageAttribution,
    portfolioDiagnostics,
    operationalDiagnostics,
    systemHealth,
    featureSnapshotProvenance,
  };

  return ObservabilityReportSchema.parse(report);
}
