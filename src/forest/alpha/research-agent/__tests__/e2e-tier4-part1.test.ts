import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResearchAgent,
  DeterministicMockLLMProvider,
  SEED_FALSIFIED,
  MICROSTRUCTURE_FEATURE_NAMES,
  createMockQueueJob,
  createMockSurvivalVerdict,
  recommendQueueFollowUp,
} from './e2e-test-utils';

describe('Tier 4: Real-World Application Scenarios (Part 1)', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  it('test_scenario_falsified_retail_seeds_clustering_and_diagnosis: post-mortem clustering on sample entries from SEED_FALSIFIED', async () => {
    const sampleSeeds = SEED_FALSIFIED.slice(0, 4);
    expect(sampleSeeds.length).toBe(4);

    const candidates = sampleSeeds.map(s => ({
      id: s.id,
      title: s.hypothesis,
      rationale: s.falsificationReason,
      indicators: [...s.featureSet],
    }));

    mockProvider.setClusteringFixture(
      JSON.stringify([
        {
          clusterId: 'cluster-retail-momentum',
          theme: 'Retail TA Trend / Momentum Exhaustion',
          memberIds: candidates.map(c => c.id),
          redundancyScore: 0.95,
          recommendedRepresentativeId: 'sma-crossover',
        },
      ]),
    );

    const clusters = await agent.clusterHypotheses({ hypotheses: candidates });
    expect(clusters.length).toBe(1);
    expect(clusters[0].redundancyScore).toBeGreaterThan(0.9);
    expect(clusters[0].memberIds).toContain('sma-crossover');
    expect(clusters[0].memberIds).toContain('macd-momentum');
  });

  it('test_scenario_microstructure_orderbook_discovery: end-to-end research campaign in order book imbalance space', async () => {
    expect(MICROSTRUCTURE_FEATURE_NAMES.length).toBeGreaterThanOrEqual(9);

    mockProvider.setHypothesisFixture(
      JSON.stringify([
        {
          id: 'hyp-micro-campaign-01',
          title: 'L2 Top-of-Book Queue Depletion Drift',
          rationale: 'Fast book depletion on bid side precedes short-term downward price impact',
          domainCategory: 'microstructure',
          proposedMetrics: { minSharpe: 1.8, minTrades: 100 },
          falsificationCriteria: ['Realized spread < cost floor'],
        },
      ]),
    );

    const [hyp] = await agent.generateHypotheses({
      domainCategory: 'microstructure',
    });

    mockProvider.setFeatureFixture(
      JSON.stringify([
        {
          name: 'depletion_imbalance_ratio',
          indicators: ['order_book_imbalance', 'trade_imbalance'],
          combinationLogic: 'order_book_imbalance / (abs(trade_imbalance) + 1e-4)',
          lookbackPeriods: [10, 30],
          causalJustification: 'Uses backward-looking realized depth snapshots and trade prints.',
        },
      ]),
    );

    const [feature] = await agent.proposeFeatureCombinations({
      targetHypothesisId: hyp.id,
      candidateIndicators: ['order_book_imbalance', 'trade_imbalance'],
    });

    expect(feature.indicators.every(ind => MICROSTRUCTURE_FEATURE_NAMES.includes(ind as never))).toBe(true);
  });

  it('test_scenario_iterative_falsification_generations: multi-round iterative research progression (Gen 0 -> Gen 1 -> Gen 2)', async () => {
    const gen0Job = createMockQueueJob({
      id: 'job-gen0',
      hypothesis: '15m High Frequency Momentum',
      status: 'FALSIFIED',
    });
    const gen0Verdict = createMockSurvivalVerdict({
      reasons: ['Fee drag exhausted all positive gross return'],
    });

    mockProvider.setNextExperimentFixture(
      JSON.stringify([
        {
          parentJobId: 'job-gen0',
          hypothesisId: 'hyp-gen1',
          title: '1h Hourly Horizon Momentum with Turnover Filter',
          proposedParameters: { timeframe: '1h', minThreshold: 2.5 },
          targetRegime: 'trending_up',
          rationale: 'Widen timeframe from 15m to 1h to reduce turnover and avoid fee drag',
        },
      ]),
    );

    const gen1Spec = await recommendQueueFollowUp(agent, gen0Job, gen0Verdict);
    expect(gen1Spec.parentJobId).toBe('job-gen0');
    expect(gen1Spec.title).toContain('1h');

    const gen1Job = createMockQueueJob({
      id: 'job-gen1',
      hypothesis: gen1Spec.title,
      status: 'FALSIFIED',
    });
    const gen1Verdict = createMockSurvivalVerdict({
      reasons: ['Walk-forward sign flips > 2 (failed in ranging/shock regimes)'],
    });

    mockProvider.setNextExperimentFixture(
      JSON.stringify([
        {
          parentJobId: 'job-gen1',
          hypothesisId: 'hyp-gen2',
          title: 'Regime-Locked 1h Momentum (trending_up only)',
          proposedParameters: { timeframe: '1h', regimeFilter: 'trending_up' },
          targetRegime: 'trending_up',
          rationale: 'Explicitly lock trading to trending_up regime to avoid sign flips in ranging regimes',
        },
      ]),
    );

    const gen2Spec = await recommendQueueFollowUp(agent, gen1Job, gen1Verdict);
    expect(gen2Spec.parentJobId).toBe('job-gen1');
    expect(gen2Spec.targetRegime).toBe('trending_up');
  });
});
