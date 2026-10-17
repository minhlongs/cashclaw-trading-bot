import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResearchAgent,
  DeterministicMockLLMProvider,
  ProviderError,
} from './e2e-test-utils';

describe('Tier 2.5: Capability 5 Boundaries — Next-Experiment Recommendations', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  it('test_recommend_next_experiments_empty_recommendations_fail_closed: rejects empty recommendations array', async () => {
    mockProvider.setNextExperimentFixture(JSON.stringify([]));

    await expect(
      agent.recommendNextExperiments({
        completedJobId: 'job-empty-spec',
        hypothesisId: 'hyp-test',
        hypothesis: 'Test',
        status: 'FALSIFIED',
      }),
    ).rejects.toThrow();
  });

  it('test_recommend_next_experiments_injection_bypass_risk_limits: rejects payload attempting to override risk limits', async () => {
    mockProvider.setNextExperimentFixture(
      JSON.stringify([
        {
          parentJobId: 'job-inject-risk',
          hypothesisId: 'hyp-followup',
          title: 'Injected Risk Override',
          proposedParameters: { maxLeverage: 100 },
          targetRegime: 'trending_up',
          rationale: 'Valid rationale',
          overrideRiskLimit: true,
          bypassCircuitBreaker: true,
        },
      ]),
    );

    await expect(
      agent.recommendNextExperiments({
        completedJobId: 'job-inject-risk',
        hypothesisId: 'hyp-test',
        hypothesis: 'Risk bypass test',
        status: 'FALSIFIED',
      }),
    ).rejects.toThrow();
  });

  it('test_recommend_next_experiments_missing_title_rejected: rejects spec missing title', async () => {
    mockProvider.setNextExperimentFixture(
      JSON.stringify([
        {
          parentJobId: 'job-no-title',
          hypothesisId: 'hyp-followup',
          proposedParameters: {},
          targetRegime: 'trending_up',
          rationale: 'Valid rationale',
        },
      ]),
    );

    await expect(
      agent.recommendNextExperiments({
        completedJobId: 'job-no-title',
        hypothesisId: 'hyp-test',
        hypothesis: 'No title test',
        status: 'FALSIFIED',
      }),
    ).rejects.toThrow();
  });

  it('test_recommend_next_experiments_empty_rationale_rejected: rejects spec with empty rationale', async () => {
    mockProvider.setNextExperimentFixture(
      JSON.stringify([
        {
          parentJobId: 'job-no-rat',
          hypothesisId: 'hyp-followup',
          title: 'No Rationale Spec',
          proposedParameters: {},
          targetRegime: 'trending_up',
          rationale: '',
        },
      ]),
    );

    await expect(
      agent.recommendNextExperiments({
        completedJobId: 'job-no-rat',
        hypothesisId: 'hyp-test',
        hypothesis: 'No rationale test',
        status: 'FALSIFIED',
      }),
    ).rejects.toThrow();
  });

  it('test_recommend_next_experiments_provider_timeout_simulation: throws ProviderError when provider times out', async () => {
    mockProvider.simulateTimeout(true);

    await expect(
      agent.recommendNextExperiments({
        completedJobId: 'job-timeout',
        hypothesisId: 'hyp-test',
        hypothesis: 'Timeout test',
        status: 'FALSIFIED',
      }),
    ).rejects.toThrow(ProviderError);
  });
});
