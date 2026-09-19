// Deliberation runner — orchestrates debate → hypotheses → CashClaw compile →
// risk advisory → portfolio advisory → decision log.

import { debateToHypothesis, type DebateToHypothesisConfig, type DebateToHypothesisResult } from './debate-to-hypothesis';
import { type StageResult } from './report-types';
import { generateRiskAdvisory, constrainConfigByAdvisory, type RiskAdvisorySet } from './risk-advisor';
import type { RiskScenarioSet } from '@/tree/research/tradingagents/risk-scenario-set';
import { advisePortfolio, proposalToScoredAlphas, type PortfolioAdvisorResult } from './portfolio-advisor';
import { DecisionLogWriter } from './decision-log';
import { parseRiskScenarios, parsePortfolioProposal, finalizeDeliberationReport } from './run-deliberation-helpers';
import type { RunDeliberationConfig, RunDeliberationResult } from './run-deliberation.types';
import type { DebateOrchestratorConfig } from './debate-orchestrator';

/** Run the full deliberation pipeline. */
export async function runDeliberation(config: RunDeliberationConfig): Promise<RunDeliberationResult> {
  const reasons: string[] = [];
  const stageResults: StageResult[] = [];

  // Initialize decision log (resume if provided). Fail-closed: a corrupt
  // resume log aborts the run — continuing on a fresh empty log would
  // silently discard the historical evidence chain.
  let writer = new DecisionLogWriter();
  if (config.initialDecisionLog) {
    const fromJson = await DecisionLogWriter.fromJSON(config.initialDecisionLog);
    if (!fromJson.ok) {
      return { ok: false, reasons: fromJson.reasons.map((r) => `decision-log resume: ${r}`) };
    }
    writer = fromJson.writer;
  }

  // Stage 1+2: Debate orchestrator → hypotheses → ExperimentSpecs
  const orchestratorConfig: DebateOrchestratorConfig = {
    router: config.router,
    maxDebateRounds: config.maxDebateRounds,
    researchGoalId: config.researchGoal.id,
    proposalId: config.proposalId,
    nowIso: config.nowIso,
  };
  const dtcConfig: DebateToHypothesisConfig = {
    orchestratorConfig,
    router: config.router,
    dataWindow: config.dataWindow,
    universe: config.universe,
    timeframe: config.timeframe,
    nowIso: config.nowIso,
    importerVersion: config.importerVersion,
    defaultCostMode: config.defaultCostMode,
  };

  let hypothesisResult: DebateToHypothesisResult | null = null;
  const debateResult = await debateToHypothesis(dtcConfig);
  if (!debateResult.ok) {
    reasons.push(...debateResult.reasons.map((r) => `debate-to-hypothesis: ${r}`));
    for (const stage of ['analyst-output', 'debate-output', 'research-synthesis', 'risk-proposal', 'portfolio-proposal'] as const) {
      stageResults.push({ stage, outcome: 'failed', reasons: debateResult.reasons });
    }
  } else {
    hypothesisResult = debateResult.value;
    for (const stage of ['analyst-output', 'debate-output', 'research-synthesis', 'risk-proposal', 'portfolio-proposal'] as const) {
      stageResults.push({ stage, outcome: 'completed', reasons: [] });
    }
  }

  // Stage 3: Risk advisory (from orchestrator's risk-advisor rounds)
  let riskAdvisory: RiskAdvisorySet | null = null;
  if (hypothesisResult) {
    const riskRounds = hypothesisResult.debateState.rounds.filter((r) => r.agentRole === 'risk-advisor');
    const scenarios = parseRiskScenarios(riskRounds);
    if (scenarios.length > 0) {
      const riskScenarioSet: RiskScenarioSet = {
        goalId: config.researchGoal.id,
        proposalId: config.proposalId,
        scenarios,
        advisoryNote: `Risk views from ${scenarios.length} advisors`,
      };
      riskAdvisory = generateRiskAdvisory(riskScenarioSet, {
        riskInputs: config.riskInputs,
        portfolioConfig: config.portfolioConfig,
      });
      stageResults.push({ stage: 'cashclaw-validation', outcome: 'completed', reasons: [] });
    } else {
      stageResults.push({ stage: 'cashclaw-validation', outcome: 'skipped', reasons: ['no parseable risk scenarios'] });
    }
  } else {
    stageResults.push({ stage: 'cashclaw-validation', outcome: 'skipped', reasons: ['debate pipeline failed'] });
  }

  // Stage 4: Portfolio advisory (buildPortfolio with advisory caps)
  let portfolioResult: PortfolioAdvisorResult | null = null;
  if (hypothesisResult && riskAdvisory) {
    const portfolioRounds = hypothesisResult.debateState.rounds.filter((r) => r.agentRole === 'portfolio-advisor');
    const proposal = portfolioRounds.length > 0
      ? parsePortfolioProposal(portfolioRounds[0].content, config.researchGoal.id, config.proposalId, config.nowIso)
      : null;
    if (proposal) {
      const scoredAlphas = proposalToScoredAlphas(proposal, config.composedAlphas);
      portfolioResult = advisePortfolio(
        proposal,
        scoredAlphas,
        config.currentWeights,
        config.riskInputs,
        constrainConfigByAdvisory(config.portfolioConfig, riskAdvisory),
        riskAdvisory,
      );
      stageResults.push({
        stage: 'human-decision',
        outcome: portfolioResult.rejected ? 'rejected' : 'completed',
        reasons: portfolioResult.rejectionReasons,
      });
    } else {
      stageResults.push({ stage: 'human-decision', outcome: 'skipped', reasons: ['no portfolio proposal from debate'] });
    }
  } else {
    stageResults.push({ stage: 'human-decision', outcome: 'skipped', reasons: ['debate pipeline or risk advisory failed'] });
  }

  // Build final report + decision log (fail-closed: every required field must be present)
  if (!hypothesisResult) {
    return { ok: false, reasons };
  }

  return finalizeDeliberationReport({
    researchGoal: config.researchGoal,
    proposalId: config.proposalId,
    nowIso: config.nowIso,
    hypothesisResult,
    riskAdvisory,
    portfolioResult,
    stageResults,
    writer,
  });
}
