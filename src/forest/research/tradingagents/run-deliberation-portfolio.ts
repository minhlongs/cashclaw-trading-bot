import { advisePortfolio, proposalToScoredAlphas, type PortfolioAdvisorResult } from './portfolio-advisor';
import { constrainConfigByAdvisory, type RiskAdvisorySet } from './risk-advisor';
import { parsePortfolioProposal } from './run-deliberation-helpers';
import type { StageResult } from './report-types';
import type { DebateToHypothesisResult } from './debate-to-hypothesis';
import type { RunDeliberationConfig } from './run-deliberation.types';

export function executePortfolioAdvisory(
  config: RunDeliberationConfig, hypothesisResult: DebateToHypothesisResult | null,
  riskAdvisory: RiskAdvisorySet | null, stageResults: StageResult[],
): PortfolioAdvisorResult | null {
  if (!hypothesisResult || !riskAdvisory) {
    stageResults.push({ stage: 'human-decision', outcome: 'skipped', reasons: ['debate pipeline or risk advisory failed'] });
    return null;
  }
  const portfolioRounds = hypothesisResult.debateState.rounds.filter((r) => r.agentRole === 'portfolio-advisor');
  const proposal = portfolioRounds.length > 0
    ? parsePortfolioProposal(portfolioRounds[0].content, config.researchGoal.id, config.proposalId, config.nowIso)
    : null;
  if (!proposal) {
    stageResults.push({ stage: 'human-decision', outcome: 'skipped', reasons: ['no portfolio proposal from debate'] });
    return null;
  }
  const scoredAlphas = proposalToScoredAlphas(proposal, config.composedAlphas);
  const result = advisePortfolio(
    proposal, scoredAlphas, config.currentWeights, config.riskInputs,
    constrainConfigByAdvisory(config.portfolioConfig, riskAdvisory), riskAdvisory,
  );
  stageResults.push({ stage: 'human-decision', outcome: result.rejected ? 'rejected' : 'completed', reasons: result.rejectionReasons });
  return result;
}
