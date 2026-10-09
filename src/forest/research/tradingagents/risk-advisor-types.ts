import type { RiskView } from '@/tree/research/tradingagents/risk-scenario-set';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';

export interface RiskAdvisory {
  readonly view: RiskView;
  readonly keyConcerns: readonly string[];
  readonly recommendedMaxExposure: number;
  readonly hedgeSuggestions: readonly string[];
  readonly monitoringSignals: readonly string[];
}

export interface RiskAdvisorySet {
  readonly goalId: string;
  readonly proposalId: string;
  readonly advisories: readonly RiskAdvisory[];
  readonly summary: string;
}

export interface RiskAdvisorConfig {
  readonly riskInputs: RiskInputs;
  readonly portfolioConfig: PortfolioConfig;
}
