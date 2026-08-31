// Risk Advisor tests — covers all hedge-suggestion branches in
// mapScenarioToAdvisory (vol-high / corr-high / liq-low) plus
// constrainConfigByAdvisory's most-conservative-cap path.

import { describe, expect, it } from 'vitest';
import { generateRiskAdvisory, constrainConfigByAdvisory, type RiskAdvisorySet } from './risk-advisor';
import type { RiskScenarioSet, RiskScenario } from '@/tree/research/tradingagents/risk-scenario-set';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';

const PORTFOLIO_CONFIG: PortfolioConfig = {
  targetVolatility: 0.15,
  maxPositionWeight: 0.8,
  maxGrossExposure: 0.8,
  maxNetExposure: 0.5,
  maxCorrelatedExposure: 0.4,
  correlationBucketThreshold: 0.7,
  maxBetaExposure: 0.3,
  maxTurnover: 0.5,
  drawdownThreshold: 0.1,
  deRiskFactor: 0.5,
};

const RISK_INPUTS: RiskInputs = {
  realizedVolatility: 0.2,
  correlationMatrix: new Map([['BTC-USD', new Map([['BTC-USD', 1.0]])]]),
  betas: new Map([['BTC-USD', 1.0]]),
  currentDrawdown: 0.02,
};

function scenario(overrides: Partial<RiskScenario>): RiskScenario {
  return {
    view: 'aggressive',
    expectedRegime: 'TREND_UP',
    keyRisks: ['Regime shift'],
    failureConditions: ['Drawdown exceeds 5%'],
    maxAcceptableExposure: 0.6,
    liquidityConcern: 'moderate',
    volatilityConcern: 'moderate',
    correlationConcern: 'moderate',
    ...overrides,
  };
}

function makeSet(scenarios: RiskScenario[]): RiskScenarioSet {
  return {
    goalId: 'goal-1',
    proposalId: 'prop-1',
    scenarios,
    advisoryNote: `Risk views from ${scenarios.length} advisors`,
  };
}

describe('generateRiskAdvisory', () => {
  it('produces advisory notes for each scenario', () => {
    const set = makeSet([scenario({ view: 'aggressive', maxAcceptableExposure: 0.6 })]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0].view).toBe('aggressive');
    expect(result.advisories[0].recommendedMaxExposure).toBe(0.6);
    expect(result.summary).toBe('Risk views from 1 advisors');
  });

  it('caps recommendedMaxExposure at the portfolio gross-exposure ceiling', () => {
    // Scenario wants 0.9 but the config only allows 0.8 → cap applies.
    const set = makeSet([scenario({ maxAcceptableExposure: 0.9 })]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    expect(result.advisories[0].recommendedMaxExposure).toBe(0.8);
  });

  it('adds a volatility hedge suggestion when vol concern is high', () => {
    const set = makeSet([scenario({ volatilityConcern: 'high', correlationConcern: 'low', liquidityConcern: 'moderate' })]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    expect(result.advisories[0].hedgeSuggestions).toContain('Consider volatility overlay or straddle hedge');
  });

  it('adds a diversification hedge suggestion when correlation concern is high', () => {
    const set = makeSet([scenario({ volatilityConcern: 'low', correlationConcern: 'high', liquidityConcern: 'moderate' })]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    expect(result.advisories[0].hedgeSuggestions).toContain('Diversify across low-correlation buckets');
  });

  it('adds a liquidity buffer suggestion when liquidity concern is low', () => {
    const set = makeSet([scenario({ volatilityConcern: 'low', correlationConcern: 'low', liquidityConcern: 'low' })]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    expect(result.advisories[0].hedgeSuggestions).toContain('Reduce position size for liquidity buffer');
  });

  it('includes monitoring signals from failure conditions and key risks', () => {
    const set = makeSet([scenario({ failureConditions: ['Drawdown exceeds 5%'], keyRisks: ['Regime shift', 'Liquidity gap'] })]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    const signals = result.advisories[0].monitoringSignals;
    expect(signals).toContain('Drawdown exceeds 5%');
    expect(signals).toContain('Regime shift');
    expect(signals).toContain('Liquidity gap');
  });

  it('builds key concerns from regime, exposure, and all concern dimensions', () => {
    const set = makeSet([scenario({ expectedRegime: 'RANGE_BOUND', maxAcceptableExposure: 0.35, liquidityConcern: 'high', volatilityConcern: 'low', correlationConcern: 'low' })]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    expect(result.advisories[0].keyConcerns).toEqual([
      'Regime: RANGE_BOUND',
      'Max exposure: 35.0%',
      'Liquidity: high',
      'Volatility: low',
      'Correlation: low',
    ]);
  });

  it('returns an empty advisory list when the scenario set is empty', () => {
    const set = makeSet([]);
    const result = generateRiskAdvisory(set, { riskInputs: RISK_INPUTS, portfolioConfig: PORTFOLIO_CONFIG });
    expect(result.advisories).toHaveLength(0);
  });
});

describe('constrainConfigByAdvisory', () => {
  const ADVISORY: RiskAdvisorySet = {
    goalId: 'goal-1',
    proposalId: 'prop-1',
    advisories: [
      { view: 'aggressive', keyConcerns: [], recommendedMaxExposure: 0.6, hedgeSuggestions: [], monitoringSignals: [] },
      { view: 'neutral', keyConcerns: [], recommendedMaxExposure: 0.5, hedgeSuggestions: [], monitoringSignals: [] },
      { view: 'conservative', keyConcerns: [], recommendedMaxExposure: 0.4, hedgeSuggestions: [], monitoringSignals: [] },
    ],
    summary: 'Risk views from 3 advisors',
  };

  it('reduces maxGrossExposure and maxNetExposure to the most conservative cap', () => {
    const constrained = constrainConfigByAdvisory(PORTFOLIO_CONFIG, ADVISORY);
    expect(constrained.maxGrossExposure).toBe(0.4);
    expect(constrained.maxNetExposure).toBe(0.4);
  });

  it('leaves targetVolatility unchanged', () => {
    const constrained = constrainConfigByAdvisory(PORTFOLIO_CONFIG, ADVISORY);
    expect(constrained.targetVolatility).toBe(PORTFOLIO_CONFIG.targetVolatility);
  });

  it('does not raise exposure above the advisory cap when the config is already lower', () => {
    const tight = { ...PORTFOLIO_CONFIG, maxGrossExposure: 0.2, maxNetExposure: 0.2 };
    const constrained = constrainConfigByAdvisory(tight, ADVISORY);
    // min() keeps the lower value — cap is advisory-only, never expansionary.
    expect(constrained.maxGrossExposure).toBe(0.2);
    expect(constrained.maxNetExposure).toBe(0.2);
  });
});