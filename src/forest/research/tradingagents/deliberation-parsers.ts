import type { RiskScenario } from '@/tree/research/tradingagents/risk-scenario-set';
import type { PortfolioProposal } from './portfolio-advisor';

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
