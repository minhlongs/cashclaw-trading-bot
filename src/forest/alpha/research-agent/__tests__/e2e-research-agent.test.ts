// CashClaw Alpha Research OS — Phase 7 ResearchAgent Safe Role Only
// Comprehensive 4-Tier Opaque-Box E2E Test Suite
// Master Mission §10, ORIGINAL_REQUEST.md (R1-R5), PROJECT.md (Features 1-20)
//
// 4-Tier Architecture:
//   Tier 1: Feature Coverage (>=5 test cases per capability, 25 tests)
//   Tier 2: Boundary & Corner Cases (>=5 test cases per capability, 25 tests)
//   Tier 3: Cross-Feature Combinations & Seam Integration (8 tests)
//   Tier 4: Real-World Application Scenarios (5 tests)
// Total: 63 test cases.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResearchAgent,
  DeterministicMockLLMProvider,
  diagnoseQueueJobFailure,
  recommendQueueFollowUp,
  createFollowUpJobSpec,
  HypothesisProposalSchema,
  FeatureProposalSchema,
  FailureDiagnosisSchema,
  HypothesisClusterSchema,
  NextExperimentSpecSchema,
  FalsificationGuardError,
  NonCausalFeatureError,
  ProviderError,
} from '../index';
import type {
  ResearchLLMProvider,
  LLMPromptPayload,
  HypothesisProposal,
  FeatureProposal,
  FailureDiagnosis,
  HypothesisCluster,
  NextExperimentSpec,
  GenerateHypothesesRequest,
  ProposeFeaturesRequest,
  ExplainFailureRequest,
  ClusterHypothesesRequest,
  RecommendExperimentsRequest,
} from '../index';
import { SEED_FALSIFIED } from '@/tree/alpha/registry/seed-falsified';
import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { SurvivalVerdict } from '@/forest/alpha/multiple-testing/types';
import { validateJobSpec } from '@/tree/alpha/queue/validation';
import { MICROSTRUCTURE_FEATURE_NAMES } from '@/tree/alpha/microstructure/contracts';

// ── Test Fixtures & Helpers ───────────────────────────────────────────────────

/** Creates a sample ResearchQueueJob fixture for testing. */
function createMockQueueJob(overrides: Partial<ResearchQueueJob> = {}): ResearchQueueJob {
  return {
    id: 'job-e2e-funding-fade-001',
    hypothesis: 'Funding rate fade yields net edge during ranging markets',
    rationale: 'Funding rate extremes lead to mean reversion when spot momentum stalls',
    features: ['funding-rate', 'volume_delta'],
    dataset: 'binance-derivatives-1h',
    regime: 'ranging_low_vol',
    universe: {
      id: 'perp-majors',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      weighting: 'equal',
      rebalanceRule: 'none',
    },
    costs: { feeBps: 10, impactBps: 10 },
    slippage: { slippageBps: 7 },
    seed: null,
    parentHypothesis: null,
    generatedBy: 'test-suite',
    timestamp: 1727193600000,
    gitSha: 'abcdef1234567890',
    status: 'FALSIFIED',
    configHash: 'hash-config-001',
    result: {
      oosPassCount: 1,
      oosTotalCount: 6,
      aggregatePnlUsd: -18500,
      summary: '1/6 OOS pass; failed cost stress test at 27 bps round-trip',
    },
    ...overrides,
  };
}

/** Creates a sample falsified SurvivalVerdict fixture for testing. */
function createMockSurvivalVerdict(overrides: Partial<SurvivalVerdict> = {}): SurvivalVerdict {
  return {
    verdict: 'falsified',
    reasons: [
      'Bootstrap CI lower bound (-0.0012) <= 0',
      'Walk-forward sign flips (3) exceeded ceiling (2)',
      'Adverse fee stress test net PnL < 0 (-$18,500)',
    ],
    ...overrides,
  };
}

describe('Alpha Research OS Phase 7: ResearchAgent Safe Role Only E2E Test Suite', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 1: FEATURE COVERAGE (>=5 TEST CASES PER CAPABILITY)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Tier 1.1: Capability 1 — Hypothesis Generation', () => {
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

      // Filtered out by falsification guard
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

  describe('Tier 1.2: Capability 2 — Feature Combination Proposals', () => {
    it('test_propose_features_causal_microstructure: proposes causal feature combination from microstructure contracts', async () => {
      const request: ProposeFeaturesRequest = {
        targetHypothesisId: 'hyp-micro-001',
        candidateIndicators: ['order_book_imbalance', 'volume_delta'],
      };
      const proposals = await agent.proposeFeatureCombinations(request);

      expect(proposals.length).toBeGreaterThan(0);
      for (const fp of proposals) {
        expect(() => FeatureProposalSchema.parse(fp)).not.toThrow();
        expect(fp.name).toBeDefined();
        expect(Array.isArray(fp.indicators)).toBe(true);
        expect(fp.indicators.length).toBeGreaterThan(0);
        expect(fp.combinationLogic.length).toBeGreaterThan(0);
        expect(Array.isArray(fp.lookbackPeriods)).toBe(true);
        expect(fp.causalJustification.length).toBeGreaterThan(0);
      }
    });

    it('test_propose_features_lookback_periods_positive: verifies all lookbacks are positive integers', async () => {
      const proposals = await agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-micro-001',
        candidateIndicators: ['funding_rate', 'basis_spread'],
      });

      for (const fp of proposals) {
        for (const lb of fp.lookbackPeriods) {
          expect(Number.isInteger(lb)).toBe(true);
          expect(lb).toBeGreaterThan(0);
        }
      }
    });

    it('test_propose_features_combination_logic_present: ensures mathematical combination formula is specified', async () => {
      const proposals = await agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-micro-001',
        candidateIndicators: ['volume_delta', 'aggressive_volume'],
      });

      for (const fp of proposals) {
        expect(typeof fp.combinationLogic).toBe('string');
        expect(fp.combinationLogic.trim().length).toBeGreaterThan(5);
      }
    });

    it('test_propose_features_economic_justification: verifies non-empty economic mechanism explanation', async () => {
      const proposals = await agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-micro-001',
        candidateIndicators: ['bid_ask_spread', 'realized_spread'],
      });

      for (const fp of proposals) {
        expect(fp.causalJustification.length).toBeGreaterThanOrEqual(10);
      }
    });

    it('test_propose_features_multi_indicator_basket: handles combinations of 3+ indicators', async () => {
      mockProvider.setFeatureFixture(
        JSON.stringify([
          {
            name: 'microstructure_composite_skew',
            indicators: ['order_book_imbalance', 'volume_delta', 'liquidity_shock'],
            combinationLogic: '(order_book_imbalance * volume_delta) / (liquidity_shock + 1e-4)',
            lookbackPeriods: [5, 15, 30],
            causalJustification: 'All three features computed from realized L2 and trade stream past ticks.',
          },
        ]),
      );

      const proposals = await agent.proposeFeatureCombinations({
        targetHypothesisId: 'hyp-micro-basket',
        candidateIndicators: ['order_book_imbalance', 'volume_delta', 'liquidity_shock'],
      });

      expect(proposals[0].indicators.length).toBe(3);
      expect(proposals[0].lookbackPeriods.length).toBe(3);
    });
  });

  describe('Tier 1.3: Capability 3 — Failure Explanations (Diagnosis)', () => {
    it('test_explain_failure_cost_exhaustion_diagnosis: diagnoses failure where gross return was positive but costs destroyed edge', async () => {
      const request: ExplainFailureRequest = {
        jobId: 'job-cost-drag-001',
        hypothesis: 'Fast 15m RSI breakout',
        reasons: ['Net PnL -$14,200 after 27 bps round-trip fees and slippage'],
        metrics: {
          grossReturnPct: 6.8,
          netPnlUsd: -14200,
          costDragBps: 27,
          numTrades: 420,
        },
      };

      const diagnosis = await agent.explainFailure(request);
      expect(() => FailureDiagnosisSchema.parse(diagnosis)).not.toThrow();
      expect(diagnosis.jobId).toBe('job-cost-drag-001');
      expect(diagnosis.primaryFailureReason).toBeDefined();
      expect(Array.isArray(diagnosis.contributingFactors)).toBe(true);
      expect(diagnosis.metricShortfalls).toBeDefined();
      expect(diagnosis.recommendations.length).toBeGreaterThan(0);
    });

    it('test_explain_failure_walk_forward_instability: diagnoses failure from excessive walk-forward sign flips', async () => {
      mockProvider.setDiagnosisFixture(
        JSON.stringify({
          jobId: 'job-wf-flip-002',
          primaryFailureReason: 'Walk-forward temporal instability with 4 sign flips across 6 test windows',
          contributingFactors: ['Regime change between 2022 bear and 2023 recovery', 'Lack of regime conditioning'],
          metricShortfalls: {
            signFlips: { expected: 2, actual: 4 },
          },
          recommendations: ['Incorporate regime conditioning to disable strategy during high-vol shock regimes'],
        }),
      );

      const diagnosis = await agent.explainFailure({
        jobId: 'job-wf-flip-002',
        hypothesis: 'Trend following without regime conditioning',
        reasons: ['Walk-forward consistency failed: 4 sign flips across 6 windows'],
      });

      expect(diagnosis.primaryFailureReason).toContain('Walk-forward');
      expect(diagnosis.metricShortfalls.signFlips.actual).toBe(4);
    });

    it('test_explain_failure_pbo_overfitting_diagnosis: diagnoses PBO overfitting violation', async () => {
      mockProvider.setDiagnosisFixture(
        JSON.stringify({
          jobId: 'job-pbo-003',
          primaryFailureReason: 'Probability of Backtest Overfitting (PBO) proxy 0.74 exceeded 0.50 threshold',
          contributingFactors: ['Excessive grid search over 844 parameter combinations'],
          metricShortfalls: {
            pboProxy: { expected: 0.5, actual: 0.74 },
          },
          recommendations: ['Halt grid search; replace brute-force sweep with causal hypothesis derivation'],
        }),
      );

      const diagnosis = await agent.explainFailure({
        jobId: 'job-pbo-003',
        hypothesis: 'Brute force multi-parameter optimizer',
        reasons: ['PBO proxy 0.74 exceeded threshold 0.50'],
      });

      expect(diagnosis.metricShortfalls.pboProxy.actual).toBe(0.74);
      expect(diagnosis.recommendations.length).toBeGreaterThanOrEqual(1);
    });

    it('test_explain_failure_metric_shortfalls_structure: verifies expected vs actual metric format', async () => {
      const diagnosis = await agent.explainFailure({
        jobId: 'job-metrics-004',
        hypothesis: 'Momentum strategy',
        reasons: ['Sharpe below required threshold'],
        metrics: { sharpe: 0.42 },
      });

      expect(diagnosis.metricShortfalls).toBeDefined();
      for (const [metric, shortfall] of Object.entries(diagnosis.metricShortfalls)) {
        expect(typeof shortfall.expected).toBe('number');
        expect(typeof shortfall.actual).toBe('number');
        expect(metric.length).toBeGreaterThan(0);
      }
    });

    it('test_explain_failure_recommendations_actionable: confirms actionable guidance provided in recommendations', async () => {
      const diagnosis = await agent.explainFailure({
        jobId: 'job-rec-005',
        hypothesis: 'Orderbook momentum',
        reasons: ['Low trade count'],
      });

      expect(diagnosis.recommendations.length).toBeGreaterThan(0);
      for (const rec of diagnosis.recommendations) {
        expect(rec.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Tier 1.4: Capability 4 — Hypothesis Clustering', () => {
    it('test_cluster_hypotheses_identifies_semantic_duplicates: clusters duplicate hypotheses based on shared premise', async () => {
      const candidates = [
        {
          id: 'hyp-rsi-01',
          title: 'RSI Oversold 25 Reversion',
          rationale: 'Fading RSI 14-period drops below 25 on BTC 1h candles',
          indicators: ['rsi'],
        },
        {
          id: 'hyp-rsi-02',
          title: 'RSI Extreme Dip Buying',
          rationale: 'Buying RSI drops below 20 on BTC hourly timeframe',
          indicators: ['rsi'],
        },
      ];

      const clusters = await agent.clusterHypotheses({
        hypotheses: candidates,
        similarityThreshold: 0.7,
      });

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
      mockProvider.setClusteringFixture(
        JSON.stringify([
          {
            clusterId: 'cluster-micro',
            theme: 'Order Book Microstructure',
            memberIds: ['hyp-micro-1'],
            redundancyScore: 0.1,
            recommendedRepresentativeId: 'hyp-micro-1',
          },
          {
            clusterId: 'cluster-funding',
            theme: 'Perpetual Funding Rate Dispersion',
            memberIds: ['hyp-funding-1'],
            redundancyScore: 0.15,
            recommendedRepresentativeId: 'hyp-funding-1',
          },
        ]),
      );

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
      mockProvider.setClusteringFixture(
        JSON.stringify([
          {
            clusterId: 'c1',
            theme: 'Mean Reversion',
            memberIds: ['h1', 'h2'],
            redundancyScore: 0.85,
            recommendedRepresentativeId: 'h1',
          },
          {
            clusterId: 'c2',
            theme: 'Breakout Momentum',
            memberIds: ['h3', 'h4'],
            redundancyScore: 0.82,
            recommendedRepresentativeId: 'h3',
          },
        ]),
      );

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
      mockProvider.setNextExperimentFixture(
        JSON.stringify([
          {
            parentJobId: 'job-survived-200',
            hypothesisId: 'hyp-survived-followup',
            title: 'Adverse Cost & Cross-Asset Robustness Stress Test',
            proposedParameters: { feeBps: 20, impactBps: 20, expandUniverse: ['SOLUSDT', 'AVAXUSDT'] },
            targetRegime: 'all',
            rationale: 'Predecessor survived base survival gates; validating robustness under 50 bps adverse friction.',
          },
        ]),
      );

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

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 2: BOUNDARY & CORNER CASES (>=5 TEST CASES PER CAPABILITY)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Tier 2.1: Capability 1 Boundaries — Hypothesis Generation', () => {
    it('test_generate_hypotheses_empty_domain_rejection: rejects empty or whitespace domain category', async () => {
      await expect(
        agent.generateHypotheses({ domainCategory: '' }),
      ).rejects.toThrow();
    });

    it('test_generate_hypotheses_malformed_json_fail_closed: fails closed when LLM returns invalid JSON syntax', async () => {
      mockProvider.setHypothesisFixture('{ unclosed_json: [');

      await expect(
        agent.generateHypotheses({ domainCategory: 'microstructure' }),
      ).rejects.toThrow();
    });

    it('test_generate_hypotheses_injection_order_execution: rejects LLM response attempting to inject trade orders', async () => {
      mockProvider.setHypothesisFixture(
        JSON.stringify([
          {
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
          },
        ]),
      );

      await expect(
        agent.generateHypotheses({ domainCategory: 'microstructure' }),
      ).rejects.toThrow();
    });

    it('test_generate_hypotheses_injection_extra_keys: rejects response with unauthorized keys via .strict()', async () => {
      mockProvider.setHypothesisFixture(
        JSON.stringify([
          {
            id: 'hyp-extra-001',
            title: 'Extra Keys Injected',
            rationale: 'Valid rationale',
            domainCategory: 'derivatives_interaction',
            proposedMetrics: { minSharpe: 1.0 },
            falsificationCriteria: ['PBO violation'],
            hallucinatedField: 'dangerous_payload',
          },
        ]),
      );

      await expect(
        agent.generateHypotheses({ domainCategory: 'derivatives_interaction' }),
      ).rejects.toThrow();
    });

    it('test_generate_hypotheses_strict_falsification_guard_error: throws FalsificationGuardError when all proposals replicate falsified classes in strict mode', async () => {
      mockProvider.setHypothesisFixture(
        JSON.stringify([
          {
            id: 'hyp-falsified-dup',
            title: 'RSI Mean-Reversion 1h',
            rationale: 'Fading RSI on 1h candles',
            domainCategory: 'ta_mean_reversion',
            proposedMetrics: { minSharpe: 1.0 },
            falsificationCriteria: ['Fail OOS'],
          },
        ]),
      );

      await expect(
        agent.generateHypotheses({
          domainCategory: 'ta_mean_reversion',
          falsifiedClassesToExclude: ['rsi-mean-reversion'],
          strictFalsificationBlock: true,
        }),
      ).rejects.toThrow(FalsificationGuardError);
    });
  });

  describe('Tier 2.2: Capability 2 Boundaries — Feature Proposals', () => {
    it('test_propose_features_non_causal_feature_rejected: throws NonCausalFeatureError when LLM proposes non-causal indicator', async () => {
      mockProvider.setFeatureFixture(
        JSON.stringify([
          {
            name: 'forward_looking_feature',
            indicators: ['close_t_plus_1'],
            combinationLogic: 'lead(close, 1)',
            lookbackPeriods: [1],
            causalJustification: 'Uses future bar close to predict current signal',
          },
        ]),
      );

      await expect(
        agent.proposeFeatureCombinations({
          targetHypothesisId: 'hyp-noncausal',
          candidateIndicators: ['close_t_plus_1'],
        }),
      ).rejects.toThrow(NonCausalFeatureError);
    });

    it('test_propose_features_negative_lookback_rejected: rejects feature proposal with negative lookback period', async () => {
      mockProvider.setFeatureFixture(
        JSON.stringify([
          {
            name: 'negative_lookback_feature',
            indicators: ['funding_rate'],
            combinationLogic: 'lag(funding_rate, -5)',
            lookbackPeriods: [-5],
            causalJustification: 'Negative lookback peek ahead',
          },
        ]),
      );

      await expect(
        agent.proposeFeatureCombinations({
          targetHypothesisId: 'hyp-neg-lb',
          candidateIndicators: ['funding_rate'],
        }),
      ).rejects.toThrow();
    });

    it('test_propose_features_zero_lookback_rejected: rejects lookback period equal to zero', async () => {
      mockProvider.setFeatureFixture(
        JSON.stringify([
          {
            name: 'zero_lookback_feature',
            indicators: ['volume_delta'],
            combinationLogic: 'volume_delta',
            lookbackPeriods: [0],
            causalJustification: 'Zero lookback period',
          },
        ]),
      );

      await expect(
        agent.proposeFeatureCombinations({
          targetHypothesisId: 'hyp-zero-lb',
          candidateIndicators: ['volume_delta'],
        }),
      ).rejects.toThrow();
    });

    it('test_propose_features_empty_indicators_rejected: rejects feature proposal with empty indicators array', async () => {
      mockProvider.setFeatureFixture(
        JSON.stringify([
          {
            name: 'empty_indicators_feature',
            indicators: [],
            combinationLogic: 'none',
            lookbackPeriods: [14],
            causalJustification: 'Empty indicators test',
          },
        ]),
      );

      await expect(
        agent.proposeFeatureCombinations({
          targetHypothesisId: 'hyp-empty-ind',
          candidateIndicators: ['funding_rate'],
        }),
      ).rejects.toThrow();
    });

    it('test_propose_features_injection_promote_strategy: rejects payload attempting strategy promotion', async () => {
      mockProvider.setFeatureFixture(
        JSON.stringify([
          {
            name: 'promo_feature',
            indicators: ['funding_rate'],
            combinationLogic: 'funding_rate',
            lookbackPeriods: [14],
            causalJustification: 'Attempting to inject promotion state',
            promoteToLive: true,
            transitionStrategy: 'LIVE',
            targetState: 'PROMOTED',
          },
        ]),
      );

      await expect(
        agent.proposeFeatureCombinations({
          targetHypothesisId: 'hyp-promo-inject',
          candidateIndicators: ['funding_rate'],
        }),
      ).rejects.toThrow();
    });
  });

  describe('Tier 2.3: Capability 3 Boundaries — Failure Diagnosis', () => {
    it('test_explain_failure_empty_reasons_rejected: rejects diagnosis request with empty reasons array', async () => {
      await expect(
        agent.explainFailure({
          jobId: 'job-empty-reasons',
          hypothesis: 'Test hypothesis',
          reasons: [],
        }),
      ).rejects.toThrow();
    });

    it('test_explain_failure_null_and_extreme_metrics: safely handles extreme metrics without runtime crash', async () => {
      const diagnosis = await agent.explainFailure({
        jobId: 'job-extreme-metrics',
        hypothesis: 'Extreme collapse strategy',
        reasons: ['Complete account wipeout'],
        metrics: {
          sharpe: -99.9,
          numTrades: 0,
          netPnlUsd: -10000000,
          maxDrawdownPct: 100,
        },
      });

      expect(diagnosis).toBeDefined();
      expect(diagnosis.jobId).toBe('job-extreme-metrics');
    });

    it('test_explain_failure_injection_alter_thresholds: rejects response attempting to inject survival gate overrides', async () => {
      mockProvider.setDiagnosisFixture(
        JSON.stringify({
          jobId: 'job-inject-gate',
          primaryFailureReason: 'Failed Sharpe threshold',
          contributingFactors: ['Cost drag'],
          metricShortfalls: {},
          recommendations: ['Lower gate threshold to pass'],
          survivalGateConfigOverride: { minSharpe: 0.1, maxPbo: 0.99 },
          bypassMultipleTesting: true,
        }),
      );

      await expect(
        agent.explainFailure({
          jobId: 'job-inject-gate',
          hypothesis: 'Gate modifier attack',
          reasons: ['Sharpe failed'],
        }),
      ).rejects.toThrow();
    });

    it('test_explain_failure_missing_job_id_rejected: rejects payload missing jobId', async () => {
      mockProvider.setDiagnosisFixture(
        JSON.stringify({
          primaryFailureReason: 'Failed reason',
          contributingFactors: [],
          metricShortfalls: {},
          recommendations: ['Some recommendation'],
        }),
      );

      await expect(
        agent.explainFailure({
          jobId: 'job-missing-id',
          hypothesis: 'Missing ID test',
          reasons: ['Failure reason'],
        }),
      ).rejects.toThrow();
    });

    it('test_explain_failure_empty_recommendations_rejected: rejects diagnosis with empty recommendations array', async () => {
      mockProvider.setDiagnosisFixture(
        JSON.stringify({
          jobId: 'job-empty-rec',
          primaryFailureReason: 'Failed reason',
          contributingFactors: [],
          metricShortfalls: {},
          recommendations: [],
        }),
      );

      await expect(
        agent.explainFailure({
          jobId: 'job-empty-rec',
          hypothesis: 'Empty recs test',
          reasons: ['Failure reason'],
        }),
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
      await expect(
        agent.clusterHypotheses({
          hypotheses: [
            { id: 'h1', title: 'H1', rationale: 'R1' },
            { id: 'h2', title: 'H2', rationale: 'R2' },
          ],
          similarityThreshold: 1.5,
        }),
      ).rejects.toThrow();

      await expect(
        agent.clusterHypotheses({
          hypotheses: [
            { id: 'h1', title: 'H1', rationale: 'R1' },
            { id: 'h2', title: 'H2', rationale: 'R2' },
          ],
          similarityThreshold: -0.1,
        }),
      ).rejects.toThrow();
    });

    it('test_cluster_hypotheses_redundancy_score_outside_bounds: rejects response with redundancy score > 1.0', async () => {
      mockProvider.setClusteringFixture(
        JSON.stringify([
          {
            clusterId: 'c-invalid-score',
            theme: 'Score out of range',
            memberIds: ['h1', 'h2'],
            redundancyScore: 1.5,
            recommendedRepresentativeId: 'h1',
          },
        ]),
      );

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
      mockProvider.setClusteringFixture(
        JSON.stringify([
          {
            clusterId: 'c-injected',
            theme: 'Injected Bypass',
            memberIds: ['h1', 'h2'],
            redundancyScore: 0.5,
            recommendedRepresentativeId: 'h1',
            bypassQueueValidation: true,
            forceEnqueueAll: true,
          },
        ]),
      );

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

  describe('Tier 2.5: Capability 5 Boundaries — Next-Experiment Recommendations', () => {
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

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 3: CROSS-FEATURE COMBINATIONS & SEAM INTEGRATION (8 TEST CASES)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Tier 3: Cross-Feature Combinations & Seam Integration', () => {
    it('test_e2e_hypothesis_to_feature_proposal_flow: chains hypothesis generation into feature proposals', async () => {
      // 1. Generate novel hypothesis
      const proposals = await agent.generateHypotheses({
        domainCategory: 'microstructure',
        maxProposals: 1,
      });
      expect(proposals.length).toBe(1);
      const hyp = proposals[0];

      // 2. Feed generated hypothesis into feature proposer
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

      await expect(
        diagnoseQueueJobFailure(agent, job, verdict),
      ).rejects.toThrow(/Cannot diagnose failure/);
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

      // Assert it passes the existing domain validateJobSpec
      const validationResult = validateJobSpec(queueSpec, []);
      expect(validationResult.valid).toBe(true);
    });

    it('test_e2e_full_research_lifecycle_loop: executes complete closed loop (Hypo -> Feature -> Sim Queue Failure -> Diagnosis -> Next Spec -> Enqueue)', async () => {
      // Step 1: Generate novel hypothesis
      const [hyp] = await agent.generateHypotheses({
        domainCategory: 'derivatives_interaction',
        maxProposals: 1,
      });
      expect(hyp).toBeDefined();

      // Step 2: Propose causal features
      const [feature] = await agent.proposeFeatureCombinations({
        targetHypothesisId: hyp.id,
        candidateIndicators: ['funding_rate', 'volume_delta'],
      });
      expect(feature).toBeDefined();

      // Step 3: Simulate Queue Job run falsification
      const simJob = createMockQueueJob({
        id: `job-${hyp.id}`,
        hypothesis: hyp.title,
        features: feature.indicators,
        status: 'FALSIFIED',
      });
      const simVerdict = createMockSurvivalVerdict({
        reasons: ['Turnover cost drag (27 bps) wiped out gross edge', 'Bootstrap CI lower bound <= 0'],
      });

      // Step 4: Ingest and diagnose failure at seam
      const diagnosis = await diagnoseQueueJobFailure(agent, simJob, simVerdict);
      expect(diagnosis.jobId).toBe(simJob.id);

      // Step 5: Recommend next follow-up experiment
      const nextSpec = await recommendQueueFollowUp(agent, simJob, simVerdict);
      expect(nextSpec.parentJobId).toBe(simJob.id);

      // Step 6: Convert to QueueJobSpec and validate against registry
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
          {
            clusterId: 'c-rsi',
            theme: 'RSI Reversion',
            memberIds: ['h-dup-1', 'h-dup-2'],
            redundancyScore: 0.92,
            recommendedRepresentativeId: 'h-dup-1',
          },
          {
            clusterId: 'c-micro',
            theme: 'Microstructure',
            memberIds: ['h-unique-3'],
            redundancyScore: 0.0,
            recommendedRepresentativeId: 'h-unique-3',
          },
        ]),
      );

      const clusters = await agent.clusterHypotheses({ hypotheses: candidates });

      // Extract only representatives
      const representatives = clusters.map(c => c.recommendedRepresentativeId);
      expect(representatives).toContain('h-dup-1');
      expect(representatives).toContain('h-unique-3');
      expect(representatives).not.toContain('h-dup-2'); // Deduplicated!
    });

    it('test_e2e_survived_job_recommendation_flow: produces robustness stress test follow-up for survived job', async () => {
      const survivedJob = createMockQueueJob({
        id: 'job-survived-999',
        status: 'SURVIVED',
        result: {
          oosPassCount: 6,
          oosTotalCount: 6,
          aggregatePnlUsd: 45000,
          summary: '6/6 OOS pass; survived all gates',
        },
      });
      const survivedVerdict: SurvivalVerdict = { verdict: 'survived', reasons: [] };

      mockProvider.setNextExperimentFixture(
        JSON.stringify([
          {
            parentJobId: survivedJob.id,
            hypothesisId: 'hyp-robustness-check',
            title: 'Adverse 50 bps Friction & Cross-Asset Breadth Test',
            proposedParameters: { feeBps: 20, impactBps: 20 },
            targetRegime: 'all',
            rationale: 'Verify edge survives under severe cost stress and across BTC/ETH/SOL universe',
          },
        ]),
      );

      const followUp = await recommendQueueFollowUp(agent, survivedJob, survivedVerdict);
      expect(followUp.parentJobId).toBe(survivedJob.id);
      expect(followUp.title).toContain('Adverse');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 TEST CASES)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Tier 4: Real-World Application Scenarios', () => {
    it('test_scenario_falsified_retail_seeds_clustering_and_diagnosis: post-mortem clustering on sample entries from SEED_FALSIFIED', async () => {
      // Ingest real seeds from seed-falsified.ts
      const sampleSeeds = SEED_FALSIFIED.slice(0, 4); // sma-crossover, donchian-breakout, volume-confirmed-momentum, macd-momentum
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
      // Verify available microstructure indicators from tree
      expect(MICROSTRUCTURE_FEATURE_NAMES.length).toBeGreaterThanOrEqual(9);

      // 1. Propose hypothesis
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

      // 2. Propose causal features using MICROSTRUCTURE_FEATURE_NAMES
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
      // Gen 0: Fails due to fee drag
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

      // Gen 1: Fails due to regime overfit
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
});
