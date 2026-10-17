import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResearchAgent,
  DeterministicMockLLMProvider,
  HypothesisProposalSchema,
  type GenerateHypothesesRequest,
} from './e2e-test-utils';

describe('Tier 1.1: Capability 1 — Hypothesis Generation', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  it('test_generate_hypotheses_valid_domain_derivatives: generates schema-valid hypotheses for derivatives interaction', async () => {
    const request: GenerateHypothesesRequest = {
      domainCategory: 'derivatives_interaction',
      maxProposals: 2,
      contextPrompt: 'Focus on perpetual funding rate and open interest divergence',
    };
    const proposals = await agent.generateHypotheses(request);

    expect(proposals).toBeDefined();
    expect(Array.isArray(proposals)).toBe(true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    for (const p of proposals) {
      expect(() => HypothesisProposalSchema.parse(p)).not.toThrow();
      expect(p.id).toBeDefined();
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.rationale.length).toBeGreaterThan(0);
      expect(p.domainCategory).toBe('derivatives_interaction');
      expect(typeof p.proposedMetrics).toBe('object');
      expect(Array.isArray(p.falsificationCriteria)).toBe(true);
      expect(p.falsificationCriteria.length).toBeGreaterThan(0);
    }
  });

  it('test_generate_hypotheses_blocks_falsified_rsi: actively blocks retail rsi-mean-reversion from seed-falsified.ts', async () => {
    mockProvider.setHypothesisFixture(
      JSON.stringify([
        {
          id: 'hyp-blocked-001',
          title: 'RSI Extremes Mean-Reversion Strategy',
          rationale: 'Buying oversold RSI 30 and selling overbought RSI 70',
          domainCategory: 'ta_mean_reversion',
          proposedMetrics: { minSharpe: 1.0 },
          falsificationCriteria: ['PBO > 0.5'],
        },
        {
          id: 'hyp-valid-002',
          title: 'Order Book Depth Imbalance Alpha',
          rationale: 'Trading based on microstructure depth imbalance',
          domainCategory: 'microstructure',
          proposedMetrics: { minSharpe: 1.5 },
          falsificationCriteria: ['Zero trades'],
        },
      ]),
    );

    const proposals = await agent.generateHypotheses({
      domainCategory: 'microstructure',
      falsifiedClassesToExclude: ['rsi-mean-reversion'],
    });

    expect(proposals.some(p => p.id === 'hyp-blocked-001')).toBe(false);
    expect(proposals.some(p => p.id === 'hyp-valid-002')).toBe(true);
  });

  it('test_generate_hypotheses_blocks_falsified_sma_cross: actively blocks retail sma-crossover', async () => {
    mockProvider.setHypothesisFixture(
      JSON.stringify([
        {
          id: 'hyp-blocked-sma',
          title: 'SMA Crossover Trend Following',
          rationale: 'Golden cross 50/200 SMA on 1h candles',
          domainCategory: 'ta_trend_momentum',
          proposedMetrics: { minTrades: 50 },
          falsificationCriteria: ['Negative net return'],
        },
      ]),
    );

    const proposals = await agent.generateHypotheses({
      domainCategory: 'ta_trend_momentum',
    });

    expect(proposals.length).toBe(0);
  });

  it('test_generate_hypotheses_respects_max_proposals: bounds returned proposals to requested limit', async () => {
    const proposals = await agent.generateHypotheses({
      domainCategory: 'derivatives_interaction',
      maxProposals: 1,
    });

    expect(proposals.length).toBeLessThanOrEqual(1);
  });

  it('test_generate_hypotheses_target_regimes_filtering: correctly includes target regime in request payload', async () => {
    await agent.generateHypotheses({
      domainCategory: 'relative_value',
      targetRegime: 'trending_up',
    });

    const history = mockProvider.getCallHistory();
    const lastCall = history[history.length - 1];
    expect(lastCall.payload.userPrompt).toContain('trending_up');
  });
});
