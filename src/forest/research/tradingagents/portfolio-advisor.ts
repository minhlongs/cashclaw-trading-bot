// Portfolio Advisor — feeds PortfolioProposal into buildPortfolio (reuse
// from src/tree/alpha/portfolio/engine.ts), which independently recalculates
// vol/beta/correlation/concentration/turnover/drawdown/risk-budget.
// Any violation → REJECT. LLM never approves.

import { buildPortfolio, type EngineScoredAlpha } from '@/tree/alpha/portfolio/engine';
import type { PortfolioResult, PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';
import { constrainConfigByAdvisory, type RiskAdvisorySet } from './risk-advisor';

/** One proposed asset in a portfolio proposal (LLM advisory only). */
export interface PortfolioAsset {
  readonly asset: string;
  readonly proposedWeight: number;
  readonly rationale: string;
}

/** LLM PortfolioProposal — advisory only. CashClaw engine decides sizing. */
export interface PortfolioProposal {
  readonly proposalId: string;
  readonly researchGoalId: string;
  readonly assets: readonly PortfolioAsset[];
  readonly hedge: string;
  readonly rebalance: string;
  readonly exposure: number;
  readonly rationale: string;
  readonly createdAt: string;
}

/** Portfolio advisor result. */
export interface PortfolioAdvisorResult {
  readonly portfolioResult: PortfolioResult;
  readonly rejected: boolean;
  readonly rejectionReasons: readonly string[];
}

/**
 * Feed a PortfolioProposal into buildPortfolio and validate.
 * The LLM proposal is advisory only; buildPortfolio independently recalculates
 * all risk overlays. Any violation returns REJECT.
 */
export function advisePortfolio(
  proposal: PortfolioProposal,
  scoredAlphas: readonly EngineScoredAlpha[],
  currentWeights: ReadonlyMap<string, number>,
  riskInputs: RiskInputs,
  portfolioConfig: PortfolioConfig,
  riskAdvisory: RiskAdvisorySet,
): PortfolioAdvisorResult {
  const reasons: string[] = [];

  // Step 1: Constrain config by risk advisory (advisory caps)
  const constrainedConfig = constrainConfigByAdvisory(portfolioConfig, riskAdvisory);

  // Step 2: Build portfolio using CashClaw's deterministic engine
  const portfolioResult = buildPortfolio(
    scoredAlphas,
    currentWeights,
    riskInputs,
    constrainedConfig,
  );

  // Step 3: Check for violations (any riskAdjustments line = a constraint bound)
  for (const adj of portfolioResult.riskAdjustments) {
    if (adj.includes('clamped') || adj.includes('clipped') || adj.includes('scaled to 0') || adj.includes('de-risked') || adj.includes('drawdown de-risk')) {
      reasons.push(`portfolio: risk overlay violation — ${adj}`);
    }
  }

  // Additional hard checks
  if (portfolioResult.grossExposure > constrainedConfig.maxGrossExposure + 1e-9) {
    reasons.push(`portfolio: gross exposure ${portfolioResult.grossExposure} exceeds max ${constrainedConfig.maxGrossExposure}`);
  }
  if (portfolioResult.netExposure > constrainedConfig.maxNetExposure + 1e-9) {
    reasons.push(`portfolio: net exposure ${portfolioResult.netExposure} exceeds max ${constrainedConfig.maxNetExposure}`);
  }
  if (portfolioResult.totalTurnover > constrainedConfig.maxTurnover + 1e-9) {
    reasons.push(`portfolio: turnover ${portfolioResult.totalTurnover} exceeds max ${constrainedConfig.maxTurnover}`);
  }
  if (portfolioResult.drawdownDeRisked && portfolioResult.grossExposure === 0) {
    reasons.push(`portfolio: drawdown de-risked to zero exposure`);
  }

  const rejected = reasons.length > 0;

  return {
    portfolioResult,
    rejected,
    rejectionReasons: reasons,
  };
}

/**
 * Convert an LLM PortfolioProposal to EngineScoredAlpha format.
 * This is the bridge from untrusted LLM output to CashClaw's validated types.
 * The LLM proposes; CashClaw validates and decides.
 */
export function proposalToScoredAlphas(
  proposal: PortfolioProposal,
  alphas: readonly ComposedAlpha[],
): EngineScoredAlpha[] {
  const scored: EngineScoredAlpha[] = [];

  for (const asset of proposal.assets) {
    const alpha = alphas.find((a) => a.alphaId === asset.asset);
    if (!alpha) continue;

    // Use the alpha's own score/confidence/direction — not LLM weights
    // LLM weights are advisory only; engine uses its own scoring
    scored.push({
      alpha,
      score: alpha.confidence,
    });
  }

  return scored;
}