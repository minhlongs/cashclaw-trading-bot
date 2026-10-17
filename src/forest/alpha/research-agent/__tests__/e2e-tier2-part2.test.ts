import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchAgent, DeterministicMockLLMProvider } from './e2e-test-utils';

describe('Tier 2.3 & 2.4: Capability 3 & 4 Boundaries', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  describe('Tier 2.3: Capability 3 Boundaries — Failure Diagnosis', () => {
    it('test_explain_failure_empty_reasons_rejected: rejects diagnosis request with empty reasons array', async () => {
      await expect(
        agent.explainFailure({ jobId: 'job-empty-reasons', hypothesis: 'Test hypothesis', reasons: [] }),
      ).rejects.toThrow();
    });

    it('test_explain_failure_null_and_extreme_metrics: safely handles extreme metrics without runtime crash', async () => {
      const diagnosis = await agent.explainFailure({
        jobId: 'job-extreme-metrics',
        hypothesis: 'Extreme collapse strategy',
        reasons: ['Complete account wipeout'],
        metrics: { sharpe: -99.9, numTrades: 0, netPnlUsd: -10000000, maxDrawdownPct: 100 },
      });

      expect(diagnosis).toBeDefined();
      expect(diagnosis.jobId).toBe('job-extreme-metrics');
    });

    it('test_explain_failure_injection_alter_thresholds: rejects response attempting to inject survival gate overrides', async () => {
      mockProvider.setDiagnosisFixture(JSON.stringify({
        jobId: 'job-inject-gate',
        primaryFailureReason: 'Failed Sharpe threshold',
        contributingFactors: ['Cost drag'],
        metricShortfalls: {},
        recommendations: ['Lower gate threshold to pass'],
        survivalGateConfigOverride: { minSharpe: 0.1, maxPbo: 0.99 },
        bypassMultipleTesting: true,
      }));

      await expect(
        agent.explainFailure({ jobId: 'job-inject-gate', hypothesis: 'Gate modifier attack', reasons: ['Sharpe failed'] }),
      ).rejects.toThrow();
    });

    it('test_explain_failure_missing_job_id_rejected: rejects payload missing jobId', async () => {
      mockProvider.setDiagnosisFixture(JSON.stringify({
        primaryFailureReason: 'Failed reason',
        contributingFactors: [],
        metricShortfalls: {},
        recommendations: ['Some recommendation'],
      }));

      await expect(
        agent.explainFailure({ jobId: 'job-missing-id', hypothesis: 'Missing ID test', reasons: ['Failure reason'] }),
      ).rejects.toThrow();
    });

    it('test_explain_failure_empty_recommendations_rejected: rejects diagnosis with empty recommendations array', async () => {
      mockProvider.setDiagnosisFixture(JSON.stringify({
        jobId: 'job-empty-rec',
        primaryFailureReason: 'Failed reason',
        contributingFactors: [],
        metricShortfalls: {},
        recommendations: [],
      }));

      await expect(
        agent.explainFailure({ jobId: 'job-empty-rec', hypothesis: 'Empty recs test', reasons: ['Failure reason'] }),
      ).rejects.toThrow();
    });
  });

  describe('Tier 2.4: Capability 4 Boundaries — Hypothesis Clustering', () => {
    it('test_cluster_hypotheses_empty_list_fast_path: returns empty array without calling provider when input is empty', async () => {
      const initialCallCount = mockProvider.getCallHistory().length;
      const clusters = await agent.clusterHypotheses({ hypotheses: [] });

      expect(clusters).toEqual([]);
      expect(mockProvider.getCallHistory().length).toBe(initialCallCount);
    });

    it('test_cluster_hypotheses_single_hypothesis_singleton_fast_path: returns single cluster without calling provider', async () => {
      const initialCallCount = mockProvider.getCallHistory().length;
      const clusters = await agent.clusterHypotheses({
        hypotheses: [{ id: 'hyp-solo-01', title: 'Solo Alpha', rationale: 'Solo rationale' }],
      });

      expect(clusters.length).toBe(1);
      expect(clusters[0].memberIds).toEqual(['hyp-solo-01']);
      expect(clusters[0].redundancyScore).toBe(0);
      expect(clusters[0].recommendedRepresentativeId).toBe('hyp-solo-01');
      expect(mockProvider.getCallHistory().length).toBe(initialCallCount);
    });

    it('test_cluster_hypotheses_invalid_threshold_bounds: rejects similarityThreshold outside [0, 1]', async () => {
      const pair = [
        { id: 'h1', title: 'H1', rationale: 'R1' },
        { id: 'h2', title: 'H2', rationale: 'R2' },
      ];
      await expect(agent.clusterHypotheses({ hypotheses: pair, similarityThreshold: 1.5 })).rejects.toThrow();
      await expect(agent.clusterHypotheses({ hypotheses: pair, similarityThreshold: -0.1 })).rejects.toThrow();
    });

    it('test_cluster_hypotheses_redundancy_score_outside_bounds: rejects response with redundancy score > 1.0', async () => {
      mockProvider.setClusteringFixture(JSON.stringify([{
        clusterId: 'c-invalid-score',
        theme: 'Score out of range',
        memberIds: ['h1', 'h2'],
        redundancyScore: 1.5,
        recommendedRepresentativeId: 'h1',
      }]));

      await expect(
        agent.clusterHypotheses({
          hypotheses: [
            { id: 'h1', title: 'H1', rationale: 'R1' },
            { id: 'h2', title: 'H2', rationale: 'R2' },
          ],
        }),
      ).rejects.toThrow();
    });

    it('test_cluster_hypotheses_injection_override_clustering: rejects response attempting to inject queue bypass', async () => {
      mockProvider.setClusteringFixture(JSON.stringify([{
        clusterId: 'c-injected',
        theme: 'Injected Bypass',
        memberIds: ['h1', 'h2'],
        redundancyScore: 0.5,
        recommendedRepresentativeId: 'h1',
        bypassQueueValidation: true,
        forceEnqueueAll: true,
      }]));

      await expect(
        agent.clusterHypotheses({
          hypotheses: [
            { id: 'h1', title: 'H1', rationale: 'R1' },
            { id: 'h2', title: 'H2', rationale: 'R2' },
          ],
        }),
      ).rejects.toThrow();
    });
  });
});
