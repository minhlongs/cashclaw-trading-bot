import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResearchAgent,
  DeterministicMockLLMProvider,
  createMockQueueJob,
  createMockSurvivalVerdict,
  diagnoseQueueJobFailure,
  recommendQueueFollowUp,
  createFollowUpJobSpec,
  validateJobSpec,
  type SurvivalVerdict,
  type NextExperimentSpec,
} from './e2e-test-utils';

describe('Tier 3: Cross-Feature Combinations & Seam Integration', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  it('test_e2e_hypothesis_to_feature_proposal_flow: chains hypothesis generation into feature proposals', async () => {
    const proposals = await agent.generateHypotheses({ domainCategory: 'microstructure', maxProposals: 1 });
    expect(proposals.length).toBe(1);
    const hyp = proposals[0];

    const featureProposals = await agent.proposeFeatureCombinations({
      targetHypothesisId: hyp.id,
      candidateIndicators: ['order_book_imbalance', 'volume_delta'],
    });

    expect(featureProposals.length).toBeGreaterThan(0);
    expect(featureProposals[0].indicators).toContain('order_book_imbalance');
  });

  it('test_e2e_queue_job_failure_to_diagnosis_seam: diagnoses falsified queue job via diagnoseQueueJobFailure seam', async () => {
    const job = createMockQueueJob();
    const verdict = createMockSurvivalVerdict();
    const diagnosis = await diagnoseQueueJobFailure(agent, job, verdict);

    expect(diagnosis).toBeDefined();
    expect(diagnosis.jobId).toBe(job.id);
    expect(diagnosis.primaryFailureReason).toBeDefined();
    expect(diagnosis.metricShortfalls).toBeDefined();
    expect(diagnosis.recommendations.length).toBeGreaterThan(0);
  });

  it('test_e2e_diagnose_survived_job_throws_fail_closed: fails closed if attempting to diagnose a survived job', async () => {
    const job = createMockQueueJob({ status: 'SURVIVED' });
    const verdict: SurvivalVerdict = { verdict: 'survived', reasons: [] };

    await expect(diagnoseQueueJobFailure(agent, job, verdict)).rejects.toThrow(/Cannot diagnose failure/);
  });

  it('test_e2e_failure_diagnosis_to_next_experiment_seam: converts failure diagnosis into actionable next experiment spec', async () => {
    const job = createMockQueueJob();
    const verdict = createMockSurvivalVerdict();
    const followUpSpec = await recommendQueueFollowUp(agent, job, verdict);

    expect(followUpSpec).toBeDefined();
    expect(followUpSpec.parentJobId).toBe(job.id);
    expect(followUpSpec.title).toBeDefined();
    expect(followUpSpec.rationale).toBeDefined();
    expect(followUpSpec.proposedParameters).toBeDefined();
  });

  it('test_e2e_create_follow_up_job_spec_ready_for_queue: transforms NextExperimentSpec into QueueJobSpec verifiable by validateJobSpec', () => {
    const job = createMockQueueJob();
    const spec: NextExperimentSpec = {
      parentJobId: job.id,
      hypothesisId: 'hyp-followup-42',
      title: 'Filtered Funding Divergence follow-up',
      proposedParameters: {
        features: ['funding-rate', 'volume_delta', 'liquidity_shock'],
        dataset: 'binance-derivatives-1h',
      },
      targetRegime: 'trending_up',
      rationale: 'Filters out low volume intervals to cut cost drag',
    };

    const queueSpec = createFollowUpJobSpec(job, spec);
    expect(queueSpec.id).toBeDefined();
    expect(queueSpec.parentHypothesis).toBe(job.id);
    expect(queueSpec.hypothesis).toBe(spec.title);
    expect(queueSpec.rationale).toBe(spec.rationale);
    expect(queueSpec.features).toEqual(['funding-rate', 'volume_delta', 'liquidity_shock']);
    expect(queueSpec.regime).toBe('trending_up');

    const validationResult = validateJobSpec(queueSpec, []);
    expect(validationResult.valid).toBe(true);
  });

  it('test_e2e_full_research_lifecycle_loop: executes complete closed loop (Hypo -> Feature -> Sim Queue Failure -> Diagnosis -> Next Spec -> Enqueue)', async () => {
    const [hyp] = await agent.generateHypotheses({ domainCategory: 'derivatives_interaction', maxProposals: 1 });
    expect(hyp).toBeDefined();

    const [feature] = await agent.proposeFeatureCombinations({
      targetHypothesisId: hyp.id,
      candidateIndicators: ['funding_rate', 'volume_delta'],
    });
    expect(feature).toBeDefined();

    const simJob = createMockQueueJob({
      id: `job-${hyp.id}`,
      hypothesis: hyp.title,
      features: feature.indicators,
      status: 'FALSIFIED',
    });
    const simVerdict = createMockSurvivalVerdict({
      reasons: ['Turnover cost drag (27 bps) wiped out gross edge', 'Bootstrap CI lower bound <= 0'],
    });

    const diagnosis = await diagnoseQueueJobFailure(agent, simJob, simVerdict);
    expect(diagnosis.jobId).toBe(simJob.id);

    const nextSpec = await recommendQueueFollowUp(agent, simJob, simVerdict);
    expect(nextSpec.parentJobId).toBe(simJob.id);

    const newJobSpec = createFollowUpJobSpec(simJob, nextSpec);
    const validation = validateJobSpec(newJobSpec, []);
    expect(validation.valid).toBe(true);
    expect(newJobSpec.parentHypothesis).toBe(simJob.id);
  });

  it('test_e2e_cluster_deduplication_queue_gating: deduplicates candidate hypotheses and yields representatives for queue', async () => {
    const candidates = [
      { id: 'h-dup-1', title: 'RSI Reversion 1h', rationale: 'RSI 14 oversold' },
      { id: 'h-dup-2', title: 'RSI Dip Buying 1h', rationale: 'RSI 14 oversold dip' },
      { id: 'h-unique-3', title: 'Order Book Depth Imbalance', rationale: 'Microstructure depth asymmetry' },
    ];

    mockProvider.setClusteringFixture(
      JSON.stringify([
        { clusterId: 'c-rsi', theme: 'RSI Reversion', memberIds: ['h-dup-1', 'h-dup-2'], redundancyScore: 0.92, recommendedRepresentativeId: 'h-dup-1' },
        { clusterId: 'c-micro', theme: 'Microstructure', memberIds: ['h-unique-3'], redundancyScore: 0.0, recommendedRepresentativeId: 'h-unique-3' },
      ]),
    );

    const clusters = await agent.clusterHypotheses({ hypotheses: candidates });
    const representatives = clusters.map(c => c.recommendedRepresentativeId);
    expect(representatives).toContain('h-dup-1');
    expect(representatives).toContain('h-unique-3');
    expect(representatives).not.toContain('h-dup-2');
  });

  it('test_e2e_survived_job_recommendation_flow: produces robustness stress test follow-up for survived job', async () => {
    const survivedJob = createMockQueueJob({
      id: 'job-survived-999',
      status: 'SURVIVED',
      result: { oosPassCount: 6, oosTotalCount: 6, aggregatePnlUsd: 45000, summary: '6/6 OOS pass; survived all gates' },
    });
    const survivedVerdict: SurvivalVerdict = { verdict: 'survived', reasons: [] };

    mockProvider.setNextExperimentFixture(
      JSON.stringify([{
        parentJobId: survivedJob.id,
        hypothesisId: 'hyp-robustness-check',
        title: 'Adverse 50 bps Friction & Cross-Asset Breadth Test',
        proposedParameters: { feeBps: 20, impactBps: 20 },
        targetRegime: 'all',
        rationale: 'Verify edge survives under severe cost stress and across BTC/ETH/SOL universe',
      }]),
    );

    const followUp = await recommendQueueFollowUp(agent, survivedJob, survivedVerdict);
    expect(followUp.parentJobId).toBe(survivedJob.id);
    expect(followUp.title).toContain('Adverse');
  });
});
