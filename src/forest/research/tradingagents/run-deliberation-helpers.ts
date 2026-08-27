// Deliberation run helpers — JSON parsing + report assembly for the top-level
// seam. Split out of run-deliberation.ts to keep each file ≤ 200 lines.

import type { RiskScenario } from '@/tree/research/tradingagents/risk-scenario-set';
import type { RiskAdvisorySet } from './risk-advisor';
import type { PortfolioProposal, PortfolioAdvisorResult } from './portfolio-advisor';
import { computeDeliberationTotals, assertNoSilentSkips, type DeliberationReport, type StageResult } from './report-types';
import type { ResearchGoal } from '@/tree/research/goals/types';
import type { DebateToHypothesisResult } from './debate-to-hypothesis';
import { logDeliberationRun, type DecisionLogWriter } from './decision-log';

/** Parse risk-advisor round content into RiskScenario entries (fail-closed per round). */
export function parseRiskScenarios(rounds: readonly { agentId: string; content: string }[]): RiskScenario[] {
  const scenarios: RiskScenario[] = [];
  for (const round of rounds) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(round.content);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;
    scenarios.push({
      view: round.agentId.replace('risk-', ''),
      expectedRegime: typeof obj.expectedRegime === 'string' ? obj.expectedRegime : 'unknown',
      keyRisks: Array.isArray(obj.keyRisks) ? obj.keyRisks.filter((r): r is string => typeof r === 'string') : [],
      failureConditions: Array.isArray(obj.failureConditions) ? obj.failureConditions.filter((r): r is string => typeof r === 'string') : [],
      maxAcceptableExposure: typeof obj.maxAcceptableExposure === 'number' ? obj.maxAcceptableExposure : 0.5,
      liquidityConcern: typeof obj.liquidityConcern === 'string' ? obj.liquidityConcern : 'unknown',
      volatilityConcern: typeof obj.volatilityConcern === 'string' ? obj.volatilityConcern : 'unknown',
      correlationConcern: typeof obj.correlationConcern === 'string' ? obj.correlationConcern : 'unknown',
    });
  }
  return scenarios;
}

/** Parse portfolio-advisor round content into a PortfolioProposal (null if unparseable). */
export function parsePortfolioProposal(
  content: string,
  goalId: string,
  proposalId: string,
  nowIso: string,
): PortfolioProposal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const assets = Array.isArray(obj.assets) ? obj.assets.filter((a): a is string => typeof a === 'string') : [];
  const weights = Array.isArray(obj.weights) ? obj.weights.filter((w): w is number => typeof w === 'number') : [];
  return {
    proposalId,
    researchGoalId: goalId,
    assets: assets.map((asset, i) => ({ asset, proposedWeight: weights[i] ?? 0, rationale: 'LLM advisory' })),
    hedge: typeof obj.hedge === 'string' ? obj.hedge : '',
    rebalance: typeof obj.rebalance === 'string' ? obj.rebalance : '',
    exposure: typeof obj.exposure === 'number' ? obj.exposure : 0,
    rationale: 'LLM advisory',
    createdAt: nowIso,
  };
}

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