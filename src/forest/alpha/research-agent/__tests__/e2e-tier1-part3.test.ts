import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchAgent, DeterministicMockLLMProvider, HypothesisClusterSchema, NextExperimentSpecSchema, type RecommendExperimentsRequest } from './e2e-test-utils';

describe('Tier 1.4 & 1.5: Capability 4 & 5 — Clustering & Recommendations', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  describe('Tier 1.4: Capability 4 — Hypothesis Clustering', () => {
    it('test_cluster_hypotheses_identifies_semantic_duplicates: clusters duplicate hypotheses based on shared premise', async () => {
      const candidates = [
        { id: 'hyp-rsi-01', title: 'RSI Oversold 25 Reversion', rationale: 'Fading RSI 14-period drops below 25 on BTC 1h candles', indicators: ['rsi'] },
        { id: 'hyp-rsi-02', title: 'RSI Extreme Dip Buying', rationale: 'Buying RSI drops below 20 on BTC hourly timeframe', indicators: ['rsi'] },
      ];
      const clusters = await agent.clusterHypotheses({ hypotheses: candidates, similarityThreshold: 0.7 });
      expect(clusters.length).toBe(1);
      const cluster = clusters[0];
      expect(() => HypothesisClusterSchema.parse(cluster)).not.toThrow();
      expect(cluster.memberIds).toContain('hyp-rsi-01');
      expect(cluster.memberIds).toContain('hyp-rsi-02');
      expect(cluster.redundancyScore).toBeGreaterThanOrEqual(0.7);
    });

    it('test_cluster_hypotheses_redundancy_score_bounded: verifies redundancy scores are in [0, 1]', async () => {
      const clusters = await agent.clusterHypotheses({
        hypotheses: [
          { id: 'h1', title: 'Hypothesis A', rationale: 'Rationale A' },
          { id: 'h2', title: 'Hypothesis B', rationale: 'Rationale B' },
        ],
      });
      for (const c of clusters) {
        expect(c.redundancyScore).toBeGreaterThanOrEqual(0);
        expect(c.redundancyScore).toBeLessThanOrEqual(1);
      }
    });

    it('test_cluster_hypotheses_selects_representative: ensures recommendedRepresentativeId is one of memberIds', async () => {
      const clusters = await agent.clusterHypotheses({
        hypotheses: [
          { id: 'h1', title: 'Hypothesis A', rationale: 'Rationale A' },
          { id: 'h2', title: 'Hypothesis B', rationale: 'Rationale B' },
        ],
      });
      for (const c of clusters) {
        expect(c.memberIds).toContain(c.recommendedRepresentativeId);
      }
    });

    it('test_cluster_hypotheses_differentiates_orthogonal_alphas: separates non-redundant hypotheses into different clusters', async () => {
      mockProvider.setClusteringFixture(JSON.stringify([
        { clusterId: 'cluster-micro', theme: 'Order Book Microstructure', memberIds: ['hyp-micro-1'], redundancyScore: 0.1, recommendedRepresentativeId: 'hyp-micro-1' },
        { clusterId: 'cluster-funding', theme: 'Perpetual Funding Rate Dispersion', memberIds: ['hyp-funding-1'], redundancyScore: 0.15, recommendedRepresentativeId: 'hyp-funding-1' },
      ]));
      const clusters = await agent.clusterHypotheses({
        hypotheses: [
          { id: 'hyp-micro-1', title: 'L2 Imbalance', rationale: 'Microstructure edge' },
          { id: 'hyp-funding-1', title: 'Cross-Asset Funding', rationale: 'Basis carry edge' },
        ],
      });
      expect(clusters.length).toBe(2);
      expect(clusters[0].memberIds).not.toEqual(clusters[1].memberIds);
    });

    it('test_cluster_hypotheses_multiple_clusters_partition: partitions 4 hypotheses into 2 thematic clusters', async () => {
      mockProvider.setClusteringFixture(JSON.stringify([
        { clusterId: 'c1', theme: 'Mean Reversion', memberIds: ['h1', 'h2'], redundancyScore: 0.85, recommendedRepresentativeId: 'h1' },
        { clusterId: 'c2', theme: 'Breakout Momentum', memberIds: ['h3', 'h4'], redundancyScore: 0.82, recommendedRepresentativeId: 'h3' },
      ]));
      const clusters = await agent.clusterHypotheses({
        hypotheses: [
          { id: 'h1', title: 'RSI Reversion', rationale: 'RSI dip' },
          { id: 'h2', title: 'Bollinger Reversion', rationale: 'Band touch' },
          { id: 'h3', title: 'Donchian Breakout', rationale: 'Channel exit' },
          { id: 'h4', title: 'ATR Breakout', rationale: 'Volatility expansion' },
        ],
      });
      expect(clusters.length).toBe(2);
      expect(clusters[0].memberIds.length).toBe(2);
      expect(clusters[1].memberIds.length).toBe(2);
    });
  });

  describe('Tier 1.5: Capability 5 — Next-Experiment Recommendations', () => {
    it('test_recommend_next_experiments_falsified_lineage: links next experiment to falsified predecessor', async () => {
      const request: RecommendExperimentsRequest = {
        completedJobId: 'job-falsified-100',
        hypothesisId: 'hyp-root-001',
        hypothesis: 'Perpetual funding rate fade on 15m timeframe',
        status: 'FALSIFIED',
        failureReasons: ['Turnover cost drag (27 bps) wiped out gross edge'],
        currentRegime: 'ranging_low_vol',
        currentFeatures: ['funding-rate'],
        currentDataset: 'binance-derivatives-15m',
        maxRecommendations: 1,
      };
      const recommendations = await agent.recommendNextExperiments(request);
      expect(recommendations.length).toBeGreaterThan(0);
      const spec = recommendations[0];
      expect(() => NextExperimentSpecSchema.parse(spec)).not.toThrow();
      expect(spec.parentJobId).toBe('job-falsified-100');
      expect(spec.hypothesisId.length).toBeGreaterThan(0);
      expect(spec.title.length).toBeGreaterThan(0);
      expect(spec.rationale.length).toBeGreaterThan(0);
      expect(typeof spec.proposedParameters).toBe('object');
    });

    it('test_recommend_next_experiments_survived_lineage: recommends robustness stress testing for surviving job', async () => {
      mockProvider.setNextExperimentFixture(JSON.stringify([{
        parentJobId: 'job-survived-200',
        hypothesisId: 'hyp-survived-followup',
        title: 'Adverse Cost & Cross-Asset Robustness Stress Test',
        proposedParameters: { feeBps: 20, impactBps: 20, expandUniverse: ['SOLUSDT', 'AVAXUSDT'] },
        targetRegime: 'all',
        rationale: 'Predecessor survived base survival gates; validating robustness under 50 bps adverse friction.',
      }]));
      const recommendations = await agent.recommendNextExperiments({
        completedJobId: 'job-survived-200',
        hypothesisId: 'hyp-survived-root',
        hypothesis: 'Microstructure depth imbalance alpha',
        status: 'SURVIVED',
        currentRegime: 'trending_up',
        currentFeatures: ['order_book_imbalance'],
        currentDataset: 'binance-l2-depth',
      });
      expect(recommendations[0].title).toContain('Robustness');
      expect(recommendations[0].parentJobId).toBe('job-survived-200');
    });

    it('test_recommend_next_experiments_proposed_parameters: verifies proposedParameters is structured object', async () => {
      const recommendations = await agent.recommendNextExperiments({
        completedJobId: 'job-params-300',
        hypothesisId: 'hyp-test',
        hypothesis: 'Basis spread reversion',
        status: 'FALSIFIED',
      });
      expect(recommendations[0].proposedParameters).toBeDefined();
      expect(typeof recommendations[0].proposedParameters).toBe('object');
    });

    it('test_recommend_next_experiments_target_regime_setting: sets target regime for follow-up spec', async () => {
      const recommendations = await agent.recommendNextExperiments({
        completedJobId: 'job-regime-400',
        hypothesisId: 'hyp-test',
        hypothesis: 'Trend following',
        status: 'FALSIFIED',
        failureReasons: ['Overfit to bull market'],
      });
      expect(recommendations[0].targetRegime).toBeDefined();
      expect(recommendations[0].targetRegime?.length).toBeGreaterThan(0);
    });

    it('test_recommend_next_experiments_priority_and_limits: respects maxRecommendations', async () => {
      const recommendations = await agent.recommendNextExperiments({
        completedJobId: 'job-lim-500',
        hypothesisId: 'hyp-test',
        hypothesis: 'Volume delta',
        status: 'FALSIFIED',
        maxRecommendations: 1,
      });
      expect(recommendations.length).toBeLessThanOrEqual(1);
    });
  });
});
