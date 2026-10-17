import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchAgent, DeterministicMockLLMProvider, FalsificationGuardError, NonCausalFeatureError } from './e2e-test-utils';

describe('Tier 2.1 & 2.2: Capability 1 & 2 Boundaries', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  describe('Tier 2.1: Capability 1 Boundaries — Hypothesis Generation', () => {
    it('test_generate_hypotheses_empty_domain_rejection: rejects empty or whitespace domain category', async () => {
      await expect(agent.generateHypotheses({ domainCategory: '' })).rejects.toThrow();
    });

    it('test_generate_hypotheses_malformed_json_fail_closed: fails closed when LLM returns invalid JSON syntax', async () => {
      mockProvider.setHypothesisFixture('{ unclosed_json: [');
      await expect(agent.generateHypotheses({ domainCategory: 'microstructure' })).rejects.toThrow();
    });

    it('test_generate_hypotheses_injection_order_execution: rejects LLM response attempting to inject trade orders', async () => {
      mockProvider.setHypothesisFixture(JSON.stringify([{
        id: 'hyp-injected-001',
        title: 'Injected Trade Executor',
        rationale: 'Valid rationale string here',
        domainCategory: 'microstructure',
        proposedMetrics: { minSharpe: 1.0 },
        falsificationCriteria: ['Negative return'],
        executeOrder: true,
        orderSide: 'BUY',
        symbol: 'BTCUSDT',
        quantity: 1.5,
      }]));
      await expect(agent.generateHypotheses({ domainCategory: 'microstructure' })).rejects.toThrow();
    });

    it('test_generate_hypotheses_injection_extra_keys: rejects response with unauthorized keys via .strict()', async () => {
      mockProvider.setHypothesisFixture(JSON.stringify([{
        id: 'hyp-extra-001',
        title: 'Extra Keys Injected',
        rationale: 'Valid rationale',
        domainCategory: 'derivatives_interaction',
        proposedMetrics: { minSharpe: 1.0 },
        falsificationCriteria: ['PBO violation'],
        hallucinatedField: 'dangerous_payload',
      }]));
      await expect(agent.generateHypotheses({ domainCategory: 'derivatives_interaction' })).rejects.toThrow();
    });

    it('test_generate_hypotheses_strict_falsification_guard_error: throws FalsificationGuardError when all proposals replicate falsified classes in strict mode', async () => {
      mockProvider.setHypothesisFixture(JSON.stringify([{
        id: 'hyp-falsified-dup',
        title: 'RSI Mean-Reversion 1h',
        rationale: 'Fading RSI on 1h candles',
        domainCategory: 'ta_mean_reversion',
        proposedMetrics: { minSharpe: 1.0 },
        falsificationCriteria: ['Fail OOS'],
      }]));
      await expect(agent.generateHypotheses({
        domainCategory: 'ta_mean_reversion',
        falsifiedClassesToExclude: ['rsi-mean-reversion'],
        strictFalsificationBlock: true,
      })).rejects.toThrow(FalsificationGuardError);
    });
  });

  describe('Tier 2.2: Capability 2 Boundaries — Feature Proposals', () => {
    it('test_propose_features_non_causal_feature_rejected: throws NonCausalFeatureError when LLM proposes non-causal indicator', async () => {
      mockProvider.setFeatureFixture(JSON.stringify([{
        name: 'forward_looking_feature',
        indicators: ['close_t_plus_1'],
        combinationLogic: 'lead(close, 1)',
        lookbackPeriods: [1],
        causalJustification: 'Uses future bar close to predict current signal',
      }]));
      await expect(agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-noncausal',
        candidateIndicators: ['close_t_plus_1'],
      })).rejects.toThrow(NonCausalFeatureError);
    });

    it('test_propose_features_negative_lookback_rejected: rejects feature proposal with negative lookback period', async () => {
      mockProvider.setFeatureFixture(JSON.stringify([{
        name: 'negative_lookback_feature',
        indicators: ['funding_rate'],
        combinationLogic: 'lag(funding_rate, -5)',
        lookbackPeriods: [-5],
        causalJustification: 'Negative lookback peek ahead',
      }]));
      await expect(agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-neg-lb',
        candidateIndicators: ['funding_rate'],
      })).rejects.toThrow();
    });

    it('test_propose_features_zero_lookback_rejected: rejects lookback period equal to zero', async () => {
      mockProvider.setFeatureFixture(JSON.stringify([{
        name: 'zero_lookback_feature',
        indicators: ['volume_delta'],
        combinationLogic: 'volume_delta',
        lookbackPeriods: [0],
        causalJustification: 'Zero lookback period',
      }]));
      await expect(agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-zero-lb',
        candidateIndicators: ['volume_delta'],
      })).rejects.toThrow();
    });

    it('test_propose_features_empty_indicators_rejected: rejects feature proposal with empty indicators array', async () => {
      mockProvider.setFeatureFixture(JSON.stringify([{
        name: 'empty_indicators_feature',
        indicators: [],
        combinationLogic: 'none',
        lookbackPeriods: [14],
        causalJustification: 'Empty indicators test',
      }]));
      await expect(agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-empty-ind',
        candidateIndicators: ['funding_rate'],
      })).rejects.toThrow();
    });

    it('test_propose_features_injection_promote_strategy: rejects payload attempting strategy promotion', async () => {
      mockProvider.setFeatureFixture(JSON.stringify([{
        name: 'promo_feature',
        indicators: ['funding_rate'],
        combinationLogic: 'funding_rate',
        lookbackPeriods: [14],
        causalJustification: 'Attempting to inject promotion state',
        promoteToLive: true,
        transitionStrategy: 'LIVE',
        targetState: 'PROMOTED',
      }]));
      await expect(agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-promo-inject',
        candidateIndicators: ['funding_rate'],
      })).rejects.toThrow();
    });
  });
});
