import type { RiskScenario, RiskView } from '@/tree/research/tradingagents/risk-scenario-set';
import type { RiskAdvisorConfig, RiskAdvisory } from './risk-advisor-types';

export function mapScenarioToAdvisory(scenario: RiskScenario, config: RiskAdvisorConfig): RiskAdvisory {
  const recommendedMaxExposure = Math.min(scenario.maxAcceptableExposure, config.portfolioConfig.maxGrossExposure);
  const hedgeSuggestions: string[] = [];
  if (scenario.volatilityConcern.includes('high')) hedgeSuggestions.push('Consider volatility overlay or straddle hedge');
  if (scenario.correlationConcern.includes('high')) hedgeSuggestions.push('Diversify across low-correlation buckets');
  if (scenario.liquidityConcern.includes('low')) hedgeSuggestions.push('Reduce position size for liquidity buffer');
  const monitoringSignals = [...scenario.failureConditions, ...scenario.keyRisks];
  const keyConcerns = [
    `Regime: ${scenario.expectedRegime}`,
    `Max exposure: ${(scenario.maxAcceptableExposure * 100).toFixed(1)}%`,
    `Liquidity: ${scenario.liquidityConcern}`,
    `Volatility: ${scenario.volatilityConcern}`,
    `Correlation: ${scenario.correlationConcern}`,
  ];
  return { view: scenario.view as RiskView, keyConcerns, recommendedMaxExposure, hedgeSuggestions, monitoringSignals };
}
