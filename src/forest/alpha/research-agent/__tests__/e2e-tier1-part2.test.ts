import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResearchAgent,
  DeterministicMockLLMProvider,
  FeatureProposalSchema,
  FailureDiagnosisSchema,
  type ProposeFeaturesRequest,
  type ExplainFailureRequest,
} from './e2e-test-utils';

describe('Tier 1.2 & 1.3: Capability 2 & 3 — Features & Failure Diagnosis', () => {
  let mockProvider: DeterministicMockLLMProvider;
  let agent: ResearchAgent;

  beforeEach(() => {
    mockProvider = new DeterministicMockLLMProvider();
    agent = new ResearchAgent({ provider: mockProvider });
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
        JSON.stringify([{
          name: 'microstructure_composite_skew',
          indicators: ['order_book_imbalance', 'volume_delta', 'liquidity_shock'],
          combinationLogic: '(order_book_imbalance * volume_delta) / (liquidity_shock + 1e-4)',
          lookbackPeriods: [5, 15, 30],
          causalJustification: 'All three features computed from realized L2 and trade stream past ticks.',
        }]),
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
        metrics: { grossReturnPct: 6.8, netPnlUsd: -14200, costDragBps: 27, numTrades: 420 },
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
          metricShortfalls: { signFlips: { expected: 2, actual: 4 } },
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
          metricShortfalls: { pboProxy: { expected: 0.5, actual: 0.74 } },
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
});
