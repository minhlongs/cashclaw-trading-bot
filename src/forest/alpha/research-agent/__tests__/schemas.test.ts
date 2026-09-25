// CashClaw Alpha Research OS — Schema and Strict Validation Tests
import { describe, it, expect } from 'vitest';
import {
  cleanJsonString,
  parseRawJson,
  HypothesisProposalSchema,
  GenerateHypothesesRequestSchema,
  FeatureProposalSchema,
  ProposeFeaturesRequestSchema,
  FailureDiagnosisSchema,
  ExplainFailureRequestSchema,
  HypothesisClusterSchema,
  ClusterHypothesesRequestSchema,
  NextExperimentSpecSchema,
  RecommendExperimentsRequestSchema,
} from '../schemas';

describe('schemas.ts — Fail-Closed Zod Validation & Anti-Injection Fences', () => {
  describe('cleanJsonString and parseRawJson', () => {
    it('strips markdown code fences from JSON strings', () => {
      const wrapped = '```json\n{"key": "value"}\n```';
      expect(cleanJsonString(wrapped)).toBe('{"key": "value"}');
      expect(parseRawJson(wrapped, 'test')).toEqual({ key: 'value' });
    });

    it('throws fail-closed error on malformed JSON', () => {
      expect(() => parseRawJson('{ invalid: json', 'testContext')).toThrow(
        /Failed to parse JSON for testContext/,
      );
    });
  });

  describe('Capability 1: HypothesisProposalSchema', () => {
    const validProposal = {
      id: 'hyp-001',
      title: 'Funding Rate Divergence',
      rationale: 'Funding divergence indicates mean reversion',
      domainCategory: 'derivatives_interaction',
      proposedMetrics: { minSharpe: 1.5, minTrades: 50 },
      falsificationCriteria: ['CI <= 0', 'p-value >= 0.05'],
    };

    it('accepts valid hypothesis proposal', () => {
      expect(() => HypothesisProposalSchema.parse(validProposal)).not.toThrow();
    });

    it('rejects injected trade execution keys via .strict()', () => {
      const injected = { ...validProposal, executeOrder: true, orderSide: 'BUY' };
      expect(() => HypothesisProposalSchema.parse(injected)).toThrow(/Unrecognized key/);
    });

    it('rejects empty string fields and empty falsification criteria', () => {
      expect(() => HypothesisProposalSchema.parse({ ...validProposal, title: '' })).toThrow();
      expect(() => HypothesisProposalSchema.parse({ ...validProposal, falsificationCriteria: [] })).toThrow();
    });

    it('validates GenerateHypothesesRequestSchema and rejects empty domain', () => {
      expect(() => GenerateHypothesesRequestSchema.parse({ domainCategory: '   ' })).toThrow();
      expect(() => GenerateHypothesesRequestSchema.parse({ domainCategory: 'microstructure' })).not.toThrow();
    });
  });

  describe('Capability 2: FeatureProposalSchema', () => {
    const validFeature = {
      name: 'orderbook_imbalance_ratio',
      indicators: ['order_book_imbalance', 'volume_delta'],
      combinationLogic: 'order_book_imbalance / (volume_delta + 1e-4)',
      lookbackPeriods: [14, 28],
      causalJustification: 'Uses backward-looking realized depth and volume',
    };

    it('accepts valid feature proposal', () => {
      expect(() => FeatureProposalSchema.parse(validFeature)).not.toThrow();
    });

    it('rejects injected promotion state keys via .strict()', () => {
      const injected = { ...validFeature, transitionStrategy: 'LIVE', promoteTo: 'LIVE' };
      expect(() => FeatureProposalSchema.parse(injected)).toThrow(/Unrecognized key/);
    });

    it('rejects non-positive lookback periods (zero and negative)', () => {
      expect(() => FeatureProposalSchema.parse({ ...validFeature, lookbackPeriods: [0] })).toThrow();
      expect(() => FeatureProposalSchema.parse({ ...validFeature, lookbackPeriods: [-5] })).toThrow();
    });

    it('rejects empty indicators array', () => {
      expect(() => FeatureProposalSchema.parse({ ...validFeature, indicators: [] })).toThrow();
    });

    it('validates ProposeFeaturesRequestSchema', () => {
      const req = { targetHypothesisId: 'hyp-1', candidateIndicators: ['order_book_imbalance'] };
      expect(() => ProposeFeaturesRequestSchema.parse(req)).not.toThrow();
    });
  });

  describe('Capability 3: FailureDiagnosisSchema', () => {
    const validDiagnosis = {
      jobId: 'job-001',
      primaryFailureReason: 'Cost exhaustion under 27 bps fee model',
      contributingFactors: ['High turnover'],
      metricShortfalls: { netPnlUsd: { expected: 1000, actual: -250 } },
      recommendations: ['Increase holding period'],
    };

    it('accepts valid failure diagnosis', () => {
      expect(() => FailureDiagnosisSchema.parse(validDiagnosis)).not.toThrow();
    });

    it('rejects injected survival gate alteration keys', () => {
      const injected = { ...validDiagnosis, survivalGateConfigOverride: { minSharpe: 0.1 } };
      expect(() => FailureDiagnosisSchema.parse(injected)).toThrow(/Unrecognized key/);
    });

    it('rejects empty recommendations array', () => {
      expect(() => FailureDiagnosisSchema.parse({ ...validDiagnosis, recommendations: [] })).toThrow();
    });

    it('validates ExplainFailureRequestSchema rejects empty reasons', () => {
      expect(() => ExplainFailureRequestSchema.parse({ jobId: 'j1', hypothesis: 'H', reasons: [] })).toThrow();
    });
  });

  describe('Capability 4: HypothesisClusterSchema', () => {
    const validCluster = {
      clusterId: 'cluster-001',
      theme: 'Microstructure Imbalance',
      memberIds: ['hyp-1', 'hyp-2'],
      redundancyScore: 0.85,
      recommendedRepresentativeId: 'hyp-1',
    };

    it('accepts valid cluster spec', () => {
      expect(() => HypothesisClusterSchema.parse(validCluster)).not.toThrow();
    });

    it('rejects redundancy scores outside [0, 1]', () => {
      expect(() => HypothesisClusterSchema.parse({ ...validCluster, redundancyScore: 1.5 })).toThrow();
      expect(() => HypothesisClusterSchema.parse({ ...validCluster, redundancyScore: -0.1 })).toThrow();
    });

    it('rejects injected execution flags via .strict()', () => {
      const injected = { ...validCluster, forceEnqueueAll: true };
      expect(() => HypothesisClusterSchema.parse(injected)).toThrow(/Unrecognized key/);
    });

    it('validates ClusterHypothesesRequestSchema', () => {
      const req = { hypotheses: [{ id: 'h1', title: 'T1', rationale: 'R1' }], similarityThreshold: 0.8 };
      expect(() => ClusterHypothesesRequestSchema.parse(req)).not.toThrow();
    });
  });

  describe('Capability 5: NextExperimentSpecSchema', () => {
    const validSpec = {
      parentJobId: 'job-001',
      hypothesisId: 'hyp-followup-1',
      title: 'Funding Rate with Volatility Filter',
      proposedParameters: { minVolumeZ: 2.0 },
      targetRegime: 'trending_up',
      rationale: 'Adding volatility filter reduces fee drag',
    };

    it('accepts valid next experiment spec', () => {
      expect(() => NextExperimentSpecSchema.parse(validSpec)).not.toThrow();
    });

    it('rejects injected risk limit overrides', () => {
      const injected = { ...validSpec, overrideRiskLimit: true, bypassCircuitBreaker: true };
      expect(() => NextExperimentSpecSchema.parse(injected)).toThrow(/Unrecognized key/);
    });

    it('rejects empty title or empty rationale', () => {
      expect(() => NextExperimentSpecSchema.parse({ ...validSpec, title: '' })).toThrow();
      expect(() => NextExperimentSpecSchema.parse({ ...validSpec, rationale: '' })).toThrow();
    });

    it('validates RecommendExperimentsRequestSchema', () => {
      const req = { completedJobId: 'job-1', hypothesis: 'Test', status: 'FALSIFIED' as const };
      expect(() => RecommendExperimentsRequestSchema.parse(req)).not.toThrow();
    });
  });
});
