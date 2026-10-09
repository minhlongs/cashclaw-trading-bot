import { debateToHypothesis, type DebateToHypothesisConfig, type DebateToHypothesisResult } from './debate-to-hypothesis';
import { generateRiskAdvisory, type RiskAdvisorySet } from './risk-advisor';
import type { RiskScenarioSet } from '@/tree/research/tradingagents/risk-scenario-set';
import { parseRiskScenarios } from './run-deliberation-helpers';
import type { StageResult } from './report-types';
import type { RunDeliberationConfig } from './run-deliberation.types';

export async function executeDebateAndHypothesis(
  config: RunDeliberationConfig, stageResults: StageResult[], reasons: string[],
): Promise<DebateToHypothesisResult | null> {
  const dtcConfig: DebateToHypothesisConfig = {
    orchestratorConfig: { router: config.router, maxDebateRounds: config.maxDebateRounds, researchGoalId: config.researchGoal.id, proposalId: config.proposalId, nowIso: config.nowIso },
    router: config.router, dataWindow: config.dataWindow, universe: config.universe, timeframe: config.timeframe, nowIso: config.nowIso,
    importerVersion: config.importerVersion, defaultCostMode: config.defaultCostMode,
  };
  const debateResult = await debateToHypothesis(dtcConfig);
  if (!debateResult.ok) {
    reasons.push(...debateResult.reasons.map((r) => `debate-to-hypothesis: ${r}`));
    for (const stage of ['analyst-output', 'debate-output', 'research-synthesis', 'risk-proposal', 'portfolio-proposal'] as const) {
      stageResults.push({ stage, outcome: 'failed', reasons: debateResult.reasons });
    }
    return null;
  }
  for (const stage of ['analyst-output', 'debate-output', 'research-synthesis', 'risk-proposal', 'portfolio-proposal'] as const) {
    stageResults.push({ stage, outcome: 'completed', reasons: [] });
  }
  return debateResult.value;
}

export function executeRiskAdvisory(
  config: RunDeliberationConfig, hypothesisResult: DebateToHypothesisResult | null, stageResults: StageResult[],
): RiskAdvisorySet | null {
  if (!hypothesisResult) { stageResults.push({ stage: 'cashclaw-validation', outcome: 'skipped', reasons: ['debate pipeline failed'] }); return null; }
  const riskRounds = hypothesisResult.debateState.rounds.filter((r) => r.agentRole === 'risk-advisor');
  const scenarios = parseRiskScenarios(riskRounds);
  if (scenarios.length === 0) { stageResults.push({ stage: 'cashclaw-validation', outcome: 'skipped', reasons: ['no parseable risk scenarios'] }); return null; }
  const set: RiskScenarioSet = { goalId: config.researchGoal.id, proposalId: config.proposalId, scenarios, advisoryNote: `Risk views from ${scenarios.length} advisors` };
  const advisory = generateRiskAdvisory(set, { riskInputs: config.riskInputs, portfolioConfig: config.portfolioConfig });
  stageResults.push({ stage: 'cashclaw-validation', outcome: 'completed', reasons: [] });
  return advisory;
}
