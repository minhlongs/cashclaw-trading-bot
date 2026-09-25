// CashClaw Alpha Research OS — ResearchAgent Core Capabilities Unit Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { SEED_FALSIFIED } from '@/tree/alpha/registry/seed-falsified';
import {
  ResearchAgent,
  FalsificationGuardError,
  NonCausalFeatureError,
  AgentValidationError,
} from '../agent';
import { DeterministicMockLLMProvider } from '../mock-provider';

describe('ResearchAgent Core Capabilities (agent.ts)', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  describe('Capability 1: generateHypotheses', () => {
    it('generates valid hypotheses using default fixture', async () => {
      const proposals = await agent.generateHypotheses({ domainCategory: 'derivatives_interaction' });
      expect(proposals.length).toBeGreaterThan(0);
      expect(proposals[0].id).toBe('hyp-mock-001');
      expect(proposals[0].domainCategory).toBe('derivatives_interaction');
    });

    it('filters out falsified proposal replicating seed-falsified class', async () => {
      mockProvider.setHypothesisFixture(JSON.stringify([{
        id: 'sma-crossover', title: 'SMA Crossover Strategy', rationale: 'Moving average trend',
        domainCategory: 'ta_trend_momentum', proposedMetrics: { minSharpe: 1.0 }, falsificationCriteria: ['drawdown > 0.2'],
      }]));
      expect(await agent.generateHypotheses({ domainCategory: 'ta_trend_momentum' })).toHaveLength(0);
    });

    it('throws FalsificationGuardError in strict mode when all proposals are falsified', async () => {
      mockProvider.setHypothesisFixture(JSON.stringify([{
        id: 'rsi-mean-reversion', title: 'RSI Reversion Strategy', rationale: 'RSI dip',
        domainCategory: 'ta_mean_reversion', proposedMetrics: { minSharpe: 1.0 }, falsificationCriteria: ['drawdown > 0.2'],
      }]));
      await expect(agent.generateHypotheses({
        domainCategory: 'ta_mean_reversion', strictFalsificationBlock: true,
      })).rejects.toThrow(FalsificationGuardError);
    });

    it('blocks all 30 seed falsified classes in strict mode and filters in non-strict mode', async () => {
      for (const entry of SEED_FALSIFIED) {
        mockProvider.setHypothesisFixture(JSON.stringify([{
          id: `hyp-${entry.id}`, title: entry.hypothesis, rationale: `Testing ${entry.id.replace(/-/g, ' ')}`,
          domainCategory: 'ta_trend_momentum', proposedMetrics: { minSharpe: 1.0 }, falsificationCriteria: ['drawdown > 0.2'],
        }]));
        expect(await agent.generateHypotheses({ domainCategory: 'ta_trend_momentum' })).toHaveLength(0);
        await expect(agent.generateHypotheses({
          domainCategory: 'ta_trend_momentum', strictFalsificationBlock: true,
        })).rejects.toThrow(FalsificationGuardError);
      }
    });

    it.each(['macd-momentum', 'donchian-breakout', 'bollinger-mean-reversion'])(
      'blocks explicitly excluded class %s in strict mode and filters in non-strict mode',
      async (excludedClass) => {
        mockProvider.setHypothesisFixture(JSON.stringify([{
          id: 'hyp-custom-id', title: `Custom Strategy for ${excludedClass.replace(/-/g, ' ')}`,
          rationale: 'Testing dynamic exclusion', domainCategory: 'ta_trend_momentum',
          proposedMetrics: { minSharpe: 1.0 }, falsificationCriteria: ['drawdown > 0.2'],
        }]));
        expect(await agent.generateHypotheses({
          domainCategory: 'ta_trend_momentum', falsifiedClassesToExclude: [excludedClass],
        })).toHaveLength(0);
        await expect(agent.generateHypotheses({
          domainCategory: 'ta_trend_momentum', falsifiedClassesToExclude: [excludedClass], strictFalsificationBlock: true,
        })).rejects.toThrow(FalsificationGuardError);
      },
    );
  });

  describe('Capability 2: proposeFeatureCombinations', () => {
    it('proposes valid causal feature combinations from microstructure contracts', async () => {
      const features = await agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-1', candidateIndicators: ['order_book_imbalance', 'volume_delta'],
      });
      expect(features.length).toBeGreaterThan(0);
      expect(features[0].indicators).toContain('order_book_imbalance');
    });

    it('throws NonCausalFeatureError when look-ahead indicator is proposed', async () => {
      mockProvider.setFeatureFixture(JSON.stringify([{
        name: 'forward_feature', indicators: ['close_t_plus_1'], combinationLogic: 'lead(close, 1)',
        lookbackPeriods: [1], causalJustification: 'Uses future bar close',
      }]));
      await expect(agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-1', candidateIndicators: ['close_t_plus_1'],
      })).rejects.toThrow(NonCausalFeatureError);
    });
  });

  describe('Capability 3: explainFailure', () => {
    it('produces structured FailureDiagnosis with shortfalls and recommendations', async () => {
      const diagnosis = await agent.explainFailure({
        jobId: 'job-100', hypothesis: 'Fast breakout', reasons: ['Cost drag under fee model'], metrics: { netPnlUsd: -500 },
      });
      expect(diagnosis.jobId).toBe('job-100');
      expect(diagnosis.primaryFailureReason).toBeDefined();
      expect(diagnosis.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Capability 4: clusterHypotheses', () => {
    it('fast-paths empty input without calling provider', async () => {
      expect(await agent.clusterHypotheses({ hypotheses: [] })).toEqual([]);
      expect(mockProvider.getCallHistory().length).toBe(0);
    });

    it('fast-paths single hypothesis as singleton cluster without calling provider', async () => {
      const clusters = await agent.clusterHypotheses({ hypotheses: [{ id: 'h1', title: 'Solo Title', rationale: 'Solo Rationale' }] });
      expect(clusters).toHaveLength(1);
      expect(clusters[0].memberIds).toEqual(['h1']);
      expect(mockProvider.getCallHistory().length).toBe(0);
    });

    it('clusters multiple hypotheses and computes redundancy', async () => {
      const clusters = await agent.clusterHypotheses({
        hypotheses: [{ id: 'hyp-mock-001', title: 'A', rationale: 'R_A' }, { id: 'hyp-mock-002', title: 'B', rationale: 'R_B' }],
      });
      expect(clusters).toHaveLength(1);
      expect(clusters[0].redundancyScore).toBeGreaterThan(0);
    });
  });

  describe('Capability 5: recommendNextExperiments', () => {
    it('generates lineage-linked next experiment spec with parentJobId', async () => {
      const specs = await agent.recommendNextExperiments({ completedJobId: 'job-falsified-1', hypothesis: 'Funding mean reversion', status: 'FALSIFIED' });
      expect(specs.length).toBeGreaterThan(0);
      expect(specs[0].parentJobId).toBe('job-falsified-1');
    });

    it('fails closed when provider returns malformed JSON', async () => {
      mockProvider.setHypothesisFixture('{ malformed: json...');
      await expect(agent.generateHypotheses({ domainCategory: 'derivatives_interaction' })).rejects.toThrow(/Failed to parse JSON/);
    });
  });

  describe('Literal "null" completion response validation', () => {
    it('throws AgentValidationError when provider returns literal "null"', async () => {
      mockProvider.setHypothesisFixture('null');
      await expect(agent.generateHypotheses({ domainCategory: 'derivatives_interaction' })).rejects.toThrow(AgentValidationError);

      mockProvider.setFeatureFixture('null');
      await expect(agent.proposeFeatureCombinations({ targetHypothesisId: 'h1', candidateIndicators: ['order_book_imbalance'] })).rejects.toThrow(AgentValidationError);

      mockProvider.setDiagnosisFixture('null');
      await expect(agent.explainFailure({ jobId: 'j1', hypothesis: 'h1', reasons: ['r1'] })).rejects.toThrow(AgentValidationError);

      mockProvider.setClusteringFixture('null');
      await expect(agent.clusterHypotheses({ hypotheses: [{ id: 'h1', title: 't1', rationale: 'r1' }, { id: 'h2', title: 't2', rationale: 'r2' }] })).rejects.toThrow(AgentValidationError);

      mockProvider.setNextExperimentFixture('null');
      await expect(agent.recommendNextExperiments({ completedJobId: 'j1', hypothesis: 'h1', status: 'FALSIFIED' })).rejects.toThrow(AgentValidationError);
    });
  });
});
