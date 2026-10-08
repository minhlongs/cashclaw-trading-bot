// CashClaw Alpha Research OS — Phase 7 ResearchAgent Types
// Pure TypeScript types inferred from strict Zod schemas and provider contracts.
import type { z } from 'zod';
import type {
  HypothesisProposalSchema,
  GenerateHypothesesRequestSchema,
  HypothesisGenerationResponseSchema,
  FeatureProposalSchema,
  ProposeFeaturesRequestSchema,
  FeatureProposalResponseSchema,
  MetricShortfallSchema,
  FailureDiagnosisSchema,
  ExplainFailureRequestSchema,
  FailureDiagnosisResponseSchema,
  ClusteringCandidateSchema,
  ClusterHypothesesRequestSchema,
  HypothesisClusterSchema,
  HypothesisClusteringResponseSchema,
  NextExperimentSpecSchema,
  RecommendExperimentsRequestSchema,
  NextExperimentResponseSchema,
} from './schemas';

export type ResearchCapability =
  | 'hypothesis_generation'
  | 'feature_proposal'
  | 'failure_diagnosis'
  | 'hypothesis_clustering'
  | 'next_experiment';

// ── Capability 1 Types ────────────────────────────────────────────────────────

export type HypothesisProposal = z.infer<typeof HypothesisProposalSchema>;
export type GenerateHypothesesRequest = z.input<typeof GenerateHypothesesRequestSchema>;
export type HypothesisGenerationRequest = GenerateHypothesesRequest;
export type HypothesisGenerationResponse = z.infer<typeof HypothesisGenerationResponseSchema>;

// ── Capability 2 Types ────────────────────────────────────────────────────────

export type FeatureProposal = z.infer<typeof FeatureProposalSchema>;
export type ProposeFeaturesRequest = z.input<typeof ProposeFeaturesRequestSchema>;
export type FeatureProposalRequest = ProposeFeaturesRequest;
export type FeatureProposalResponse = z.infer<typeof FeatureProposalResponseSchema>;

// ── Capability 3 Types ────────────────────────────────────────────────────────

export type MetricShortfall = z.infer<typeof MetricShortfallSchema>;
export type FailureDiagnosis = z.infer<typeof FailureDiagnosisSchema>;
export type ExplainFailureRequest = z.input<typeof ExplainFailureRequestSchema>;
export type FailureDiagnosisRequest = ExplainFailureRequest;
export type FailureDiagnosisResponse = z.infer<typeof FailureDiagnosisResponseSchema>;

// ── Capability 4 Types ────────────────────────────────────────────────────────

export type ClusteringCandidate = z.infer<typeof ClusteringCandidateSchema>;
export type ClusterHypothesesRequest = z.input<typeof ClusterHypothesesRequestSchema>;
export type HypothesisClusteringRequest = ClusterHypothesesRequest;
export type HypothesisCluster = z.infer<typeof HypothesisClusterSchema>;
export type HypothesisClusteringResponse = z.infer<typeof HypothesisClusteringResponseSchema>;

// ── Capability 5 Types ────────────────────────────────────────────────────────

export type NextExperimentSpec = z.infer<typeof NextExperimentSpecSchema>;
export type RecommendExperimentsRequest = z.input<typeof RecommendExperimentsRequestSchema>;
export type NextExperimentRequest = RecommendExperimentsRequest;
export type NextExperimentResponse = z.infer<typeof NextExperimentResponseSchema>;

// ── Provider Contract ─────────────────────────────────────────────────────────

export interface LLMPromptPayload {
  readonly capability: ResearchCapability;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly seed?: number;
}

export interface ResearchLLMProvider {
  readonly name: string;
  generateCompletion(payload: LLMPromptPayload): Promise<string>;
}
