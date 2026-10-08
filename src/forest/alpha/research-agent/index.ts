// CashClaw Alpha Research OS — Phase 7 ResearchAgent Public Barrel Export
// Master Mission §10: Untrusted quantitative research assistant with fail-closed safety fences.

export {
  ResearchAgent,
  ResearchAgentError,
  AgentValidationError,
  FalsificationGuardError,
  NonCausalFeatureError,
} from './agent';
export type { ResearchAgentDeps } from './agent';

export {
  ProviderError,
  ResearchProviderError,
  formatHypothesisPrompt,
  formatFeatureProposalPrompt,
  formatFailureDiagnosisPrompt,
  formatClusteringPrompt,
  formatNextExperimentPrompt,
} from './provider';
export type { ProviderErrorCode } from './provider';

export { DeterministicMockLLMProvider } from './mock-provider';
export type { MockProviderOptions, MockCallRecord } from './mock-provider';

export {
  diagnoseQueueJobFailure,
  recommendQueueFollowUp,
  createFollowUpJobSpec,
} from './seam';
export type { FollowUpJobOptions } from './seam';

export type {
  ResearchCapability,
  LLMPromptPayload,
  ResearchLLMProvider,
  HypothesisProposal,
  GenerateHypothesesRequest,
  HypothesisGenerationRequest,
  HypothesisGenerationResponse,
  FeatureProposal,
  ProposeFeaturesRequest,
  FeatureProposalRequest,
  FeatureProposalResponse,
  MetricShortfall,
  FailureDiagnosis,
  ExplainFailureRequest,
  FailureDiagnosisRequest,
  FailureDiagnosisResponse,
  ClusteringCandidate,
  ClusterHypothesesRequest,
  HypothesisClusteringRequest,
  HypothesisCluster,
  HypothesisClusteringResponse,
  NextExperimentSpec,
  RecommendExperimentsRequest,
  NextExperimentRequest,
  NextExperimentResponse,
} from './types';

export {
  cleanJsonString,
  parseRawJson,
  HypothesisProposalSchema,
  GenerateHypothesesRequestSchema,
  HypothesisGenerationRequestSchema,
  HypothesisGenerationResponseSchema,
  FeatureProposalSchema,
  ProposeFeaturesRequestSchema,
  FeatureProposalRequestSchema,
  FeatureProposalResponseSchema,
  MetricShortfallSchema,
  FailureDiagnosisSchema,
  ExplainFailureRequestSchema,
  FailureDiagnosisRequestSchema,
  FailureDiagnosisResponseSchema,
  ClusteringCandidateSchema,
  ClusterHypothesesRequestSchema,
  HypothesisClusteringRequestSchema,
  HypothesisClusterSchema,
  HypothesisClusteringResponseSchema,
  NextExperimentSpecSchema,
  RecommendExperimentsRequestSchema,
  NextExperimentRequestSchema,
  NextExperimentResponseSchema,
} from './schemas';
