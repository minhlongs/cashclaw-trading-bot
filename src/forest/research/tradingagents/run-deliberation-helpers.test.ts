// Deliberation helpers tests — pure JSON parsing for risk scenarios and portfolio proposals.

import { describe, expect, it } from 'vitest';
import { parseRiskScenarios, parsePortfolioProposal } from './run-deliberation-helpers';

const NOW = '2026-08-26T00:00:00.000Z';

describe('parseRiskScenarios', () => {
  it('parses a valid risk round into a RiskScenario', () => {
    const rounds = [
      {
        agentId: 'risk-aggressive',
        content: JSON.stringify({
          expectedRegime: 'TREND_UP',
          keyRisks: ['Regime shift', 'Liquidity gap'],
          failureConditions: ['Drawdown exceeds 5%'],
          maxAcceptableExposure: 0.6,
          liquidityConcern: 'moderate',
          volatilityConcern: 'high',
          correlationConcern: 'low',
        }),
      },
    ];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].view).toBe('aggressive');
    expect(scenarios[0].expectedRegime).toBe('TREND_UP');
    expect(scenarios[0].keyRisks).toEqual(['Regime shift', 'Liquidity gap']);
    expect(scenarios[0].maxAcceptableExposure).toBe(0.6);
  });

  it('skips rounds with invalid JSON', () => {
    const rounds = [{ agentId: 'risk-neutral', content: 'not-json' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('skips null JSON', () => {
    const rounds = [{ agentId: 'risk-neutral', content: 'null' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('skips non-object JSON (number)', () => {
    const rounds = [{ agentId: 'risk-neutral', content: '42' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('skips non-object JSON (string)', () => {
    const rounds = [{ agentId: 'risk-neutral', content: '"just a string"' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('applies defaults for missing fields', () => {
    const rounds = [{ agentId: 'risk-aggressive', content: '{}' }];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].expectedRegime).toBe('unknown');
    expect(scenarios[0].keyRisks).toEqual([]);
    expect(scenarios[0].maxAcceptableExposure).toBe(0.5);
    expect(scenarios[0].liquidityConcern).toBe('unknown');
  });

  it('filters non-string entries from keyRisks', () => {
    const rounds = [
      {
        agentId: 'risk-aggressive',
        content: JSON.stringify({ keyRisks: ['real', 42, null, 'also-real'] }),
      },
    ];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios[0].keyRisks).toEqual(['real', 'also-real']);
  });

  it('handles multiple rounds', () => {
    const rounds = [
      { agentId: 'risk-aggressive', content: '{}' },
      { agentId: 'risk-neutral', content: '{}' },
      { agentId: 'risk-conservative', content: '{}' },
    ];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios).toHaveLength(3);
    expect(scenarios.map((s) => s.view)).toEqual(['aggressive', 'neutral', 'conservative']);
  });
});

describe('parsePortfolioProposal', () => {
  it('parses a valid proposal into a PortfolioProposal', () => {
    const content = JSON.stringify({
      assets: ['alpha-momentum', 'alpha-value'],
      weights: [0.3, 0.2],
      hedge: 'volatility overlay',
      rebalance: 'weekly',
      exposure: 0.5,
      rationale: 'test rationale',
    });
    const proposal = parsePortfolioProposal(content, 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.proposalId).toBe('prop-1');
    expect(proposal.researchGoalId).toBe('goal-1');
    expect(proposal.assets).toHaveLength(2);
    expect(proposal.assets[0].asset).toBe('alpha-momentum');
    expect(proposal.assets[0].proposedWeight).toBe(0.3);
    expect(proposal.assets[1].proposedWeight).toBe(0.2);
    expect(proposal.hedge).toBe('volatility overlay');
    expect(proposal.exposure).toBe(0.5);
    expect(proposal.createdAt).toBe(NOW);
  });

  it('defaults proposedWeight to 0 when weights array is shorter than assets', () => {
    const content = JSON.stringify({ assets: ['alpha-momentum', 'alpha-value'], weights: [0.3] });
    const proposal = parsePortfolioProposal(content, 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.assets[0].proposedWeight).toBe(0.3);
    expect(proposal.assets[1].proposedWeight).toBe(0);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePortfolioProposal('not-json', 'g', 'p', NOW)).toBeNull();
  });

  it('returns null for non-object JSON (number)', () => {
    expect(parsePortfolioProposal('42', 'g', 'p', NOW)).toBeNull();
  });

  it('returns null for null JSON', () => {
    expect(parsePortfolioProposal('null', 'g', 'p', NOW)).toBeNull();
  });

  it('filters non-string assets and non-number weights', () => {
    const content = JSON.stringify({ assets: ['alpha-momentum', 42, null], weights: ['bad', 0.3] });
    const proposal = parsePortfolioProposal(content, 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.assets.map((a) => a.asset)).toEqual(['alpha-momentum']);
    expect(proposal.assets[0].proposedWeight).toBe(0.3);
  });

  it('applies defaults for missing optional fields', () => {
    const proposal = parsePortfolioProposal('{"assets": []}', 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.hedge).toBe('');
    expect(proposal.rebalance).toBe('');
    expect(proposal.exposure).toBe(0);
  });
});
