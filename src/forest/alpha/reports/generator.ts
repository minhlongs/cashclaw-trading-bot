import type { Experiment, RegimePerformance } from '@/forest/alpha/experiments/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { AttributionReport } from '@/forest/alpha/attribution/types';
import { RegimeLabel } from '@/tree/regime/types';
import { buildRecommendations } from './generator-recommendations';
import { buildRegimeAnalysis, baselineDelta } from './generator-regime';

export interface RegimeAnalysisEntry { readonly trades: number; readonly winRate: number; readonly avgPnL: number; }
export type RegimeAnalysis = Record<RegimeLabel, RegimeAnalysisEntry>;

export interface ResearchReport {
  readonly title: string; readonly generatedAt: string; readonly experimentId: string;
  readonly summary: {
    readonly totalReturn: number; readonly netPnl: number;
    readonly sharpe: number | null; readonly maxDrawdown: number; readonly vsBaseline: number | null;
  };
  readonly evaluation: EvaluationReport; readonly attribution: AttributionReport;
  readonly regimeAnalysis: RegimeAnalysis;
  recommendations: string[];
}

export function generateResearchReport({
  experiment, evaluation, baseline, attribution,
}: {
  experiment: Experiment; evaluation: EvaluationReport;
  baseline: { report: EvaluationReport } | null; attribution: AttributionReport;
}): ResearchReport {
  const vsBaseline = baselineDelta(evaluation, baseline?.report.netPnl ?? null);
  const report: ResearchReport = {
    title: `Alpha Research: ${experiment.hypothesis}`, generatedAt: new Date().toISOString(), experimentId: experiment.id,
    summary: { totalReturn: evaluation.totalReturn, netPnl: evaluation.netPnl, sharpe: evaluation.sharpe, maxDrawdown: evaluation.maxDrawdown, vsBaseline },
    evaluation, attribution,
    regimeAnalysis: buildRegimeAnalysis((experiment as unknown as { regimePerformance?: RegimePerformance }).regimePerformance),
    recommendations: [],
  };
  report.recommendations = buildRecommendations(report);
  return report;
}
