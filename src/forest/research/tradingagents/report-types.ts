import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';
import type { ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { ExperimentSpec } from '@/tree/research/alpha/experiment-spec';
import type { ResearchLineage } from '@/tree/research/evidence/lineage';
import type { RiskAdvisorySet } from './risk-advisor';
import type { PortfolioAdvisorResult } from './portfolio-advisor';
import type { DeliberationTotals, StageResult } from './deliberation-report-contracts';

export * from './deliberation-report-contracts';
export { computeDeliberationTotals, sumBuckets, assertNoSilentSkips } from './deliberation-report-totals';

export interface DeliberationReport {
  readonly researchGoalId: string;
  readonly proposalId: string;
  readonly decisionProposal: DecisionProposal;
  readonly debateState: DebateState;
  readonly hypotheses: readonly ResearchHypothesis[];
  readonly experimentSpecs: readonly ExperimentSpec[];
  readonly lineage: ResearchLineage;
  readonly riskAdvisory: RiskAdvisorySet;
  readonly portfolioResult: PortfolioAdvisorResult;
  readonly modelProvenance: readonly ModelProvenanceRecord[];
  readonly toolProvenance: readonly ToolProvenance[];
  readonly stageResults: readonly StageResult[];
  readonly totals: DeliberationTotals;
  readonly createdAt: string;
}

export function summarizeDeliberationReport(report: DeliberationReport): string {
  const t = report.totals;
  return `DeliberationReport: ${t.total} stages — completed ${t.completed}, failed ${t.failed}, skipped ${t.skipped}, rejected ${t.rejected}`;
}
