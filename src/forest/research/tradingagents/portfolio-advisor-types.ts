import type { PortfolioResult } from '@/tree/alpha/portfolio/types';

export interface PortfolioAsset {
  readonly asset: string;
  readonly proposedWeight: number;
  readonly rationale: string;
}

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

export interface PortfolioAdvisorResult {
  readonly portfolioResult: PortfolioResult;
  readonly rejected: boolean;
  readonly rejectionReasons: readonly string[];
}
