// Alpha Research Report Generator
// Produces a human-readable ResearchReport from experiment results.

import type {
  Experiment,
  RegimePerformance,
} from '@/forest/alpha/experiments/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { AttributionReport } from '@/forest/alpha/attribution/types';
import { RegimeLabel } from '@/tree/regime/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RegimeAnalysisEntry {
  trades: number;
  winRate: number;
  avgPnL: number;
}

export type RegimeAnalysis = Record<RegimeLabel, RegimeAnalysisEntry>;

export interface ResearchReport {
  title: string;
  generatedAt: string;
  experimentId: string;
  summary: {
    totalReturn: number;
    netPnl: number;
    sharpe: number | null;
    maxDrawdown: number;
    vsBaseline: number | null;
  };
  evaluation: EvaluationReport;
  attribution: AttributionReport;
  regimeAnalysis: RegimeAnalysis;
  recommendations: string[];
}

// ── Recommendation engine ────────────────────────────────────────────────────

function buildRecommendations(report: ResearchReport): string[] {
  const recs: string[] = [];

  if (report.summary.sharpe !== null && report.summary.sharpe < 0.5) {
    recs.push('Sharpe ratio below 0.5 — strategy not viable for live trading');
  }
  if (report.summary.maxDrawdown > 0.2) {
    recs.push(
      'Max drawdown exceeds 20% — reduce position size or tighten stops',
    );
  }

  const profitableRegimes = Object.entries(report.regimeAnalysis).filter(
    ([, entry]) => entry.trades > 0 && entry.avgPnL > 0,
  );

  if (profitableRegimes.length === 1) {
    const [label] = profitableRegimes[0]!;
    recs.push(`Only ${label} is profitable — deploy as regime-conditional strategy only`);
  } else if (profitableRegimes.length === 0) {
    recs.push('No profitable regimes detected — revisit feature set or entry rules');
  }

  return recs;
}

// ── Regime analysis builder ──────────────────────────────────────────────────

function buildRegimeAnalysis(
  regimePerf: RegimePerformance | undefined,
): RegimeAnalysis {
  const empty: RegimeAnalysisEntry = { trades: 0, winRate: 0, avgPnL: 0 };

  return Object.values(RegimeLabel).reduce<RegimeAnalysis>((acc, label) => {
    const entry = regimePerf?.[label];
    const trades = entry ? entry.sampleCount : 0;
    const avgPnL = trades > 0 ? entry!.totalPnl / trades : 0;
    acc[label] = entry
      ? { trades, winRate: entry.winRate, avgPnL }
      : { ...empty };
    return acc;
  }, {} as RegimeAnalysis);
}

// ── Baseline delta ───────────────────────────────────────────────────────────

function baselineDelta(
  evalReport: EvaluationReport,
  baselinePnl: number | null,
): number | null {
  if (baselinePnl === null) return null;
  const strategyPnl = evalReport.netPnl;
  if (baselinePnl === 0) return strategyPnl === 0 ? 0 : strategyPnl > 0 ? Infinity : -Infinity;
  return strategyPnl - baselinePnl;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateResearchReport({
  experiment,
  evaluation,
  baseline,
  attribution,
}: {
  experiment: Experiment;
  evaluation: EvaluationReport;
  baseline: { report: EvaluationReport } | null;
  attribution: AttributionReport;
}): ResearchReport {
  const vsBaseline = baselineDelta(evaluation, baseline?.report.netPnl ?? null);

  const report: ResearchReport = {
    title: `Alpha Research: ${experiment.hypothesis}`,
    generatedAt: new Date().toISOString(),
    experimentId: experiment.id,
    summary: {
      totalReturn: evaluation.totalReturn,
      netPnl: evaluation.netPnl,
      sharpe: evaluation.sharpe,
      maxDrawdown: evaluation.maxDrawdown,
      vsBaseline,
    },
    evaluation,
    attribution,
    regimeAnalysis: buildRegimeAnalysis(
      (experiment as unknown as Record<string, unknown> & { regimePerformance?: RegimePerformance }).regimePerformance,
    ),
    recommendations: [],
  };

  report.recommendations = buildRecommendations(report);
  return report;
}