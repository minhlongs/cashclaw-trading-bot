import { buildPortfolio, type EngineScoredAlpha } from '@/tree/alpha/portfolio/engine';
import type { RiskInputs, PortfolioConfig } from '@/tree/alpha/portfolio/types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';
import { constrainConfigByAdvisory, type RiskAdvisorySet } from './risk-advisor';
import { collectPortfolioViolations } from './portfolio-advisor-check';
import type { PortfolioProposal, PortfolioAdvisorResult } from './portfolio-advisor-types';

export * from './portfolio-advisor-types';

export function advisePortfolio(
  p: PortfolioProposal, alphas: readonly EngineScoredAlpha[],
  w: ReadonlyMap<string, number>, r: RiskInputs, cfg: PortfolioConfig, adv: RiskAdvisorySet
): PortfolioAdvisorResult {
  const constrained = constrainConfigByAdvisory(cfg, adv);
  const result = buildPortfolio(alphas, w, r, constrained);
  const reasons = collectPortfolioViolations(result, constrained);
  return { portfolioResult: result, rejected: reasons.length > 0, rejectionReasons: reasons };
}

export function proposalToScoredAlphas(
  proposal: PortfolioProposal, alphas: readonly ComposedAlpha[]
): EngineScoredAlpha[] {
  return proposal.assets
    .map(a => alphas.find(x => x.alphaId === a.asset))
    .filter((x): x is ComposedAlpha => Boolean(x))
    .map(alpha => ({ alpha, score: alpha.confidence }));
}
