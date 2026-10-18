// Portfolio Advisor tests — covers branch paths for risk overlay violations
// and advisory constraints. Pure function, no I/O.

import { describe, expect, it } from 'vitest';
import { advisePortfolio, proposalToScoredAlphas, type PortfolioProposal } from './portfolio-advisor';
import { constrainConfigByAdvisory, type RiskAdvisorySet } from './risk-advisor';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';
import { RegimeLabel } from '@/tree/regime/types';

const NOW = '2026-08-26T00:00:00.000Z';

const BASE_PORTFOLIO_CONFIG: PortfolioConfig = {
  targetVolatility: 0.15, maxPositionWeight: 0.8, maxGrossExposure: 0.8, maxNetExposure: 0.5,
  maxCorrelatedExposure: 0.4, correlationBucketThreshold: 0.7, maxBetaExposure: 0.3,
  maxTurnover: 0.5, drawdownThreshold: 0.1, deRiskFactor: 0.5,
};

const BASE_RISK_INPUTS: RiskInputs = {
  realizedVolatility: 0.2,
  correlationMatrix: new Map([['BTC-USD', new Map([['BTC-USD', 1.0]])]]),
  betas: new Map([['BTC-USD', 1.0]]),
  currentDrawdown: 0.02,
};

const BASE_COMPOSED_ALPHAS: ComposedAlpha[] = [{
  alphaId: 'alpha-momentum', direction: 'buy', confidence: 0.6, expectedReturn: 0.02,
  expectedCost: 0.001, expectedTurnover: 0.1, regime: RegimeLabel.TREND_UP, horizon: '20d',
  provenance: 'deliberation', featureDependencies: ['momentum_20d'], timestamp: Date.parse(NOW),
}];

const BASE_PROPOSAL: PortfolioProposal = {
  proposalId: 'prop-1', researchGoalId: 'goal-1',
  assets: [{ asset: 'alpha-momentum', proposedWeight: 0.3, rationale: 'trend' }],
  hedge: 'volatility overlay', rebalance: 'weekly', exposure: 0.5,
  rationale: 'test rationale', createdAt: NOW,
};

const BASE_RISK_ADVISORY: RiskAdvisorySet = {
  goalId: 'goal-1',
  proposalId: 'prop-1',
  advisories: [
    {
      view: 'aggressive',
      keyConcerns: ['Regime: TREND_UP', 'Max exposure: 60.0%', 'Liquidity: moderate', 'Volatility: high', 'Correlation: low'],
      recommendedMaxExposure: 0.6,
      hedgeSuggestions: ['Consider volatility overlay or straddle hedge'],
      monitoringSignals: ['Drawdown exceeds 5%', 'Regime shift'],
    },
    {
      view: 'neutral',
      keyConcerns: ['Regime: TREND_UP', 'Max exposure: 50.0%', 'Liquidity: moderate', 'Volatility: moderate', 'Correlation: moderate'],
      recommendedMaxExposure: 0.5,
      hedgeSuggestions: [],
      monitoringSignals: ['Drawdown exceeds 5%', 'Regime shift'],
    },
    {
      view: 'conservative',
      keyConcerns: ['Regime: TREND_UP', 'Max exposure: 40.0%', 'Liquidity: high', 'Volatility: low', 'Correlation: low'],
      recommendedMaxExposure: 0.4,
      hedgeSuggestions: ['Diversify across low-correlation buckets'],
      monitoringSignals: ['Drawdown exceeds 5%', 'Regime shift'],
    },
  ],
  summary: 'Risk views from 3 advisors',
};

describe('advisePortfolio', () => {
  it('returns rejected=true when position cap triggers clipped violation', () => {
    const config: PortfolioConfig = { ...BASE_PORTFOLIO_CONFIG, maxPositionWeight: 0.05 };
    const result = advisePortfolio(
      BASE_PROPOSAL,
      [{ alpha: BASE_COMPOSED_ALPHAS[0], score: 0.6 }],
      new Map(),
      BASE_RISK_INPUTS,
      config,
      BASE_RISK_ADVISORY,
    );

    expect(result.rejected).toBe(true);
    expect(result.rejectionReasons.some((r) => r.includes('clipped'))).toBe(true);
  });

  it('returns rejected=true when drawdown de-risks to near-zero exposure', () => {
    const highDrawdownRiskInputs: RiskInputs = { ...BASE_RISK_INPUTS, currentDrawdown: 0.15 };
    const config: PortfolioConfig = {
      ...BASE_PORTFOLIO_CONFIG,
      deRiskFactor: 0.001,
      drawdownThreshold: 0.1,
      maxPositionWeight: 1.0,
    };

    const result = advisePortfolio(
      BASE_PROPOSAL,
      [{ alpha: BASE_COMPOSED_ALPHAS[0], score: 0.6 }],
      new Map(),
      highDrawdownRiskInputs,
      config,
      BASE_RISK_ADVISORY,
    );

    expect(result.portfolioResult.drawdownDeRisked).toBe(true);
    expect(result.portfolioResult.grossExposure).toBeLessThan(0.001);
    expect(result.rejected).toBe(true);
    expect(result.rejectionReasons.some((r) => r.includes('drawdown de-risk'))).toBe(true);
  });

  it('returns rejected=true when risk overlay violation (clamped/clipped/scaled/de-risked)', () => {
    const config: PortfolioConfig = { ...BASE_PORTFOLIO_CONFIG, maxPositionWeight: 0.01 };
    const result = advisePortfolio(
      BASE_PROPOSAL,
      [{ alpha: BASE_COMPOSED_ALPHAS[0], score: 0.6 }],
      new Map(),
      BASE_RISK_INPUTS,
      config,
      BASE_RISK_ADVISORY,
    );

    expect(result.rejected).toBe(true);
    expect(
      result.rejectionReasons.some((r) => r.includes('clamped') || r.includes('clipped') || r.includes('de-risked')),
    ).toBe(true);
  });

  it('returns rejected=false when all constraints satisfied', () => {
    const config: PortfolioConfig = { ...BASE_PORTFOLIO_CONFIG, maxPositionWeight: 0.9 };
    const result = advisePortfolio(
      BASE_PROPOSAL,
      [{ alpha: BASE_COMPOSED_ALPHAS[0], score: 0.6 }],
      new Map(),
      BASE_RISK_INPUTS,
      config,
      BASE_RISK_ADVISORY,
    );

    expect(result.rejected).toBe(false);
    expect(result.rejectionReasons.length).toBe(0);
    expect(result.portfolioResult.positions.length).toBe(1);
    expect(result.portfolioResult.grossExposure).toBeGreaterThan(0);
  });

  it('constrainConfigByAdvisory reduces maxGrossExposure and maxNetExposure', () => {
    const config = { ...BASE_PORTFOLIO_CONFIG };
    const constrained = constrainConfigByAdvisory(config, BASE_RISK_ADVISORY);

    expect(constrained.maxGrossExposure).toBe(0.4);
    expect(constrained.maxNetExposure).toBe(0.4);
    expect(constrained.targetVolatility).toBe(config.targetVolatility);
  });
});

describe('proposalToScoredAlphas', () => {
  it('maps proposal assets to scored alphas using alpha confidence', () => {
    const proposal: PortfolioProposal = {
      ...BASE_PROPOSAL,
      assets: [
        { asset: 'alpha-momentum', proposedWeight: 0.3, rationale: 'trend' },
        { asset: 'alpha-value', proposedWeight: 0.2, rationale: 'value' },
      ],
    };
    const alphas: ComposedAlpha[] = [
      BASE_COMPOSED_ALPHAS[0],
      { ...BASE_COMPOSED_ALPHAS[0], alphaId: 'alpha-value', direction: 'buy', confidence: 0.5 },
    ];

    const scored = proposalToScoredAlphas(proposal, alphas);
    expect(scored).toHaveLength(2);
    expect(scored[0].alpha.alphaId).toBe('alpha-momentum');
    expect(scored[0].score).toBe(0.6);
    expect(scored[1].alpha.alphaId).toBe('alpha-value');
    expect(scored[1].score).toBe(0.5);
  });

  it('skips assets not found in composed alphas', () => {
    const proposal: PortfolioProposal = {
      ...BASE_PROPOSAL,
      assets: [
        { asset: 'alpha-momentum', proposedWeight: 0.3, rationale: 'trend' },
        { asset: 'unknown-alpha', proposedWeight: 0.2, rationale: 'unknown' },
      ],
    };

    const scored = proposalToScoredAlphas(proposal, BASE_COMPOSED_ALPHAS);
    expect(scored).toHaveLength(1);
    expect(scored[0].alpha.alphaId).toBe('alpha-momentum');
  });

  it('returns empty array when no assets match', () => {
    const proposal: PortfolioProposal = {
      ...BASE_PROPOSAL,
      assets: [
        { asset: 'unknown-1', proposedWeight: 0.3, rationale: 'x' },
        { asset: 'unknown-2', proposedWeight: 0.2, rationale: 'y' },
      ],
    };

    expect(proposalToScoredAlphas(proposal, BASE_COMPOSED_ALPHAS)).toHaveLength(0);
  });
});
