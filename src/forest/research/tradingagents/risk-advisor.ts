import type { RiskScenarioSet } from '@/tree/research/tradingagents/risk-scenario-set';
import type { PortfolioConfig } from '@/tree/alpha/portfolio/types';
import type { RiskAdvisorConfig, RiskAdvisorySet } from './risk-advisor-types';
import { mapScenarioToAdvisory } from './risk-advisor-mapping';
export type { RiskAdvisory, RiskAdvisorySet, RiskAdvisorConfig } from './risk-advisor-types';

export function generateRiskAdvisory(riskScenarioSet: RiskScenarioSet, config: RiskAdvisorConfig): RiskAdvisorySet {
  const advisories = riskScenarioSet.scenarios.map((scenario) => mapScenarioToAdvisory(scenario, config));
  return { goalId: riskScenarioSet.goalId, proposalId: riskScenarioSet.proposalId, advisories, summary: riskScenarioSet.advisoryNote };
}

export function constrainConfigByAdvisory(config: PortfolioConfig, advisory: RiskAdvisorySet): PortfolioConfig {
  const minMaxExposure = Math.min(...advisory.advisories.map((a) => a.recommendedMaxExposure));
  return { ...config, maxGrossExposure: Math.min(config.maxGrossExposure, minMaxExposure), maxNetExposure: Math.min(config.maxNetExposure, minMaxExposure) };
}
