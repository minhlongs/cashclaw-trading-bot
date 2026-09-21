import type { RiskAdvisorySet } from './risk-advisor';
import type { PortfolioAdvisorResult } from './portfolio-advisor';
import { computeDeliberationTotals, assertNoSilentSkips, type DeliberationReport, type StageResult } from './report-types';
import type { ResearchGoal } from '@/tree/research/goals/types';
import type { DebateToHypothesisResult } from './debate-to-hypothesis';
import { logDeliberationRun, type DecisionLogWriter } from './decision-log';

/** Assemble the final DeliberationReport + append to the decision log. */
export async function finalizeDeliberationReport(
  config: {
    readonly researchGoal: ResearchGoal;
    readonly proposalId: string;
    readonly nowIso: string;
    readonly hypothesisResult: DebateToHypothesisResult;
    readonly riskAdvisory: RiskAdvisorySet | null;
    readonly portfolioResult: PortfolioAdvisorResult | null;
    readonly stageResults: readonly StageResult[];
    readonly writer: DecisionLogWriter;
  },
): Promise<{ ok: true; report: DeliberationReport; decisionLog: string } | { ok: false; reasons: readonly string[] }> {
  const reasons: string[] = [];

  const report: DeliberationReport = {
    researchGoalId: config.researchGoal.id,
    proposalId: config.proposalId,
    decisionProposal: config.hypothesisResult.decisionProposal,
    debateState: config.hypothesisResult.debateState,
    hypotheses: config.hypothesisResult.hypotheses,
    experimentSpecs: config.hypothesisResult.experimentSpecs,
    lineage: config.hypothesisResult.lineage,
    riskAdvisory: config.riskAdvisory ?? {
      goalId: config.researchGoal.id,
      proposalId: config.proposalId,
      advisories: [],
      summary: 'no risk advisory produced',
    },
    portfolioResult: config.portfolioResult ?? {
      portfolioResult: {
        positions: [],
        grossExposure: 0,
        netExposure: 0,
        totalTurnover: 0,
        riskAdjustments: [],
        drawdownDeRisked: false,
      },
      rejected: true,
      rejectionReasons: ['no portfolio advisory produced'],
    },
    modelProvenance: config.hypothesisResult.modelProvenance,
    toolProvenance: config.hypothesisResult.toolProvenance,
    stageResults: config.stageResults,
    totals: computeDeliberationTotals(config.stageResults),
    createdAt: config.nowIso,
  };

  assertNoSilentSkips(report, config.stageResults.length);

  const logResult = await logDeliberationRun(config.writer, {
    researchGoalId: config.researchGoal.id,
    proposalId: config.proposalId,
    analystOutputs: config.hypothesisResult.debateState.rounds.filter((r) => r.agentRole === 'analyst'),
    debateOutputs: config.hypothesisResult.debateState.rounds.filter(
      (r) => r.agentRole === 'bull-researcher' || r.agentRole === 'bear-researcher',
    ),
    researchSynthesis: config.hypothesisResult.decisionProposal,
    riskProposal: config.riskAdvisory ?? { skipped: true },
    portfolioProposal: config.portfolioResult ?? { skipped: true },
    cashclawValidation: { portfolioRejected: config.portfolioResult?.rejected ?? true },
    humanDecision: { final: config.portfolioResult?.rejected ? 'REJECT' : 'APPROVE_FOR_SHADOW' },
    timestamp: config.nowIso,
  });
  if (!logResult.ok) {
    reasons.push(...logResult.reasons.map((r) => `decision-log: ${r}`));
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return { ok: true, report, decisionLog: config.writer.toJSON() };
}
