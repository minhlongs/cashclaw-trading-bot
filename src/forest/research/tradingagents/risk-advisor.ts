// Risk Advisor — maps RiskScenarioSet (aggressive/neutral/conservative) to
// advisory notes ONLY. Never sets size. Actual sizing delegated to
// buildPortfolio overlays. Pure advisory function.

import type { RiskScenarioSet, RiskScenario, RiskView } from '@/tree/research/tradingagents/risk-scenario-set';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';

/** Advisory output for one risk view. */
export interface RiskAdvisory {
  readonly view: RiskView;
  readonly keyConcerns: readonly string[];
  readonly recommendedMaxExposure: number;
  readonly hedgeSuggestions: readonly string[];
  readonly monitoringSignals: readonly string[];
}

/** Full risk advisory set. */
export interface RiskAdvisorySet {
  readonly goalId: string;
  readonly proposalId: string;
  readonly advisories: readonly RiskAdvisory[];
  readonly summary: string;
}

/** Risk advisor config. */
export interface RiskAdvisorConfig {
  readonly riskInputs: RiskInputs;
  readonly portfolioConfig: PortfolioConfig;
}

/**
 * Generate advisory notes from a RiskScenarioSet.
 * CashClaw's buildPortfolio overlays decide actual sizing.
 * This function only produces advisory notes — never sets size.
 */
export function generateRiskAdvisory(
  riskScenarioSet: RiskScenarioSet,
  config: RiskAdvisorConfig,
): RiskAdvisorySet {
  const advisories: RiskAdvisory[] = [];

  for (const scenario of riskScenarioSet.scenarios) {
    const advisory = mapScenarioToAdvisory(scenario, config);
    advisories.push(advisory);
  }

  return {
    goalId: riskScenarioSet.goalId,
    proposalId: riskScenarioSet.proposalId,
    advisories,
    summary: riskScenarioSet.advisoryNote,
  };
}

/** Map a single scenario to advisory notes. */
function mapScenarioToAdvisory(
  scenario: RiskScenario,
  config: RiskAdvisorConfig,
): RiskAdvisory {
  const { portfolioConfig } = config;

  // Advisory: cap exposure based on scenario's maxAcceptableExposure
  // but actual enforcement is in buildPortfolio's position/gross/net caps
  const recommendedMaxExposure = Math.min(
    scenario.maxAcceptableExposure,
    portfolioConfig.maxGrossExposure,
  );

  // Advisory: hedge suggestions based on concerns
  const hedgeSuggestions: string[] = [];
  if (scenario.volatilityConcern.includes('high')) {
    hedgeSuggestions.push('Consider volatility overlay or straddle hedge');
  }
  if (scenario.correlationConcern.includes('high')) {
    hedgeSuggestions.push('Diversify across low-correlation buckets');
  }
  if (scenario.liquidityConcern.includes('low')) {
    hedgeSuggestions.push('Reduce position size for liquidity buffer');
  }

  // Advisory: monitoring signals
  const monitoringSignals: string[] = [
    ...scenario.failureConditions,
    ...scenario.keyRisks,
  ];

  // Advisory: key concerns summary
  const keyConcerns: string[] = [
    `Regime: ${scenario.expectedRegime}`,
    `Max exposure: ${(scenario.maxAcceptableExposure * 100).toFixed(1)}%`,
    `Liquidity: ${scenario.liquidityConcern}`,
    `Volatility: ${scenario.volatilityConcern}`,
    `Correlation: ${scenario.correlationConcern}`,
  ];

  return {
    view: scenario.view as RiskView,
    keyConcerns,
    recommendedMaxExposure,
    hedgeSuggestions,
    monitoringSignals,
  };
}

/**
 * Combine risk advisory with portfolio config for sizing decisions.
 * This is called by portfolio-advisor before buildPortfolio.
 * Returns a constrained PortfolioConfig that respects advisory caps.
 */
export function constrainConfigByAdvisory(
  config: PortfolioConfig,
  advisory: RiskAdvisorySet,
): PortfolioConfig {
  // Take the most conservative (lowest) max exposure across all views
  const minMaxExposure = Math.min(...advisory.advisories.map((a) => a.recommendedMaxExposure));

  return {
    ...config,
    maxGrossExposure: Math.min(config.maxGrossExposure, minMaxExposure),
    maxNetExposure: Math.min(config.maxNetExposure, minMaxExposure),
  };
}