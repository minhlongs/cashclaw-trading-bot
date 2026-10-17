import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResearchAgent,
  DeterministicMockLLMProvider,
} from './e2e-test-utils';

describe('Tier 4: Real-World Application Scenarios (Part 2)', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  it('test_scenario_comprehensive_adversarial_injection_neutralization: proves complete immunity to prompt injection attempts', async () => {
    // Attack 1: Injection trying to execute trade order
    mockProvider.setHypothesisFixture(
      JSON.stringify([
        {
          id: 'hyp-attack-01',
          title: 'Normal Title',
          rationale: 'Normal rationale',
          domainCategory: 'microstructure',
          proposedMetrics: { minSharpe: 1.0 },
          falsificationCriteria: ['CI <= 0'],
          action: 'ORDER_EXECUTE',
          orderPayload: { symbol: 'BTCUSDT', side: 'BUY', qty: 100 },
        },
      ]),
    );

    await expect(agent.generateHypotheses({ domainCategory: 'microstructure' })).rejects.toThrow();

    // Attack 2: Injection trying to mutate promotion status to LIVE
    mockProvider.setNextExperimentFixture(
      JSON.stringify([
        {
          parentJobId: 'job-attack-02',
          hypothesisId: 'hyp-attack-02',
          title: 'Promote to live',
          proposedParameters: {},
          targetRegime: 'all',
          rationale: 'Valid rationale',
          promotionState: 'LIVE',
          bypassApproval: true,
        },
      ]),
    );

    await expect(
      agent.recommendNextExperiments({
        completedJobId: 'job-attack-02',
        hypothesisId: 'hyp-test',
        hypothesis: 'Test',
        status: 'SURVIVED',
      }),
    ).rejects.toThrow();

    // Attack 3: Injection trying to alter survival gate configuration
    mockProvider.setDiagnosisFixture(
      JSON.stringify({
        jobId: 'job-attack-03',
        primaryFailureReason: 'Overfit',
        contributingFactors: [],
        metricShortfalls: {},
        recommendations: ['Do something'],
        gateConfigOverride: { minSharpe: -10, significanceLevel: 0.99 },
      }),
    );

    await expect(
      agent.explainFailure({
        jobId: 'job-attack-03',
        hypothesis: 'Test',
        reasons: ['Overfit'],
      }),
    ).rejects.toThrow();
  });

  it('test_scenario_cross_regime_relative_value_portfolio: generates and evaluates hypothesis portfolio across market regimes', async () => {
    mockProvider.setHypothesisFixture(
      JSON.stringify([
        {
          id: 'hyp-rv-trending',
          title: 'Cointegrated Cross-Asset Relative Value in Trending Regime',
          rationale: 'Exploiting rolling beta divergence on paired L1 assets during trending markets',
          domainCategory: 'relative_value',
          proposedMetrics: { minSharpe: 1.4, halfLifeBars: 24 },
          falsificationCriteria: ['ADF stationarity p-value > 0.05'],
        },
      ]),
    );

    const [rvHyp] = await agent.generateHypotheses({
      domainCategory: 'relative_value',
      targetRegime: 'trending_up',
    });

    expect(rvHyp.domainCategory).toBe('relative_value');
    expect(rvHyp.proposedMetrics.halfLifeBars).toBe(24);
  });
});
