// CashClaw Alpha Research OS — Phase 7 Research Provider
// Inverted provider contract, error definitions, and prompt formatting utilities.
import type {
  LLMPromptPayload,
  GenerateHypothesesRequest,
  ProposeFeaturesRequest,
  ExplainFailureRequest,
  ClusterHypothesesRequest,
  RecommendExperimentsRequest,
} from './types';

export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'PROVIDER_UNAVAILABLE'
  | 'INJECTION_REJECTED'
  | 'SCHEMA_VIOLATION';

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly providerName: string;

  constructor(
    message: string,
    options?: { code?: ProviderErrorCode; providerName?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = options?.code ?? 'PROVIDER_UNAVAILABLE';
    this.providerName = options?.providerName ?? 'unknown';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export const ResearchProviderError = ProviderError;
export type ResearchProviderError = ProviderError;

const BASE_SAFE_SYSTEM_PROMPT =
  'You are an untrusted quantitative research assistant for Alpha Research OS. ' +
  'You operate strictly under read-only research constraints. You have ZERO authority to execute trades, ' +
  'place orders, mutate promotion states, or alter survival thresholds. ' +
  'Respond ONLY with a valid JSON matching the requested schema. Do not include markdown commentary.';

export function formatHypothesisPrompt(request: GenerateHypothesesRequest): LLMPromptPayload {
  const excluded = (request.falsifiedClassesToExclude ?? []).join(', ');
  const userPrompt = JSON.stringify({
    task: 'generate_hypotheses',
    domainCategory: request.domainCategory,
    targetRegime: request.targetRegime ?? 'all',
    maxProposals: request.maxProposals ?? 3,
    contextPrompt: request.contextPrompt ?? 'Formulate falsifiable quantitative alpha hypotheses.',
    falsifiedClassesToAvoid: excluded || 'None specified; avoid retail TA momentum/reversion.',
  });

  return {
    capability: 'hypothesis_generation',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Propose novel hypotheses outside exhausted falsified classes.`,
    userPrompt,
    temperature: 0.2,
  };
}

export function formatFeatureProposalPrompt(request: ProposeFeaturesRequest): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'propose_features',
    targetHypothesisId: request.targetHypothesisId,
    candidateIndicators: request.candidateIndicators,
    maxLookback: request.maxLookback ?? 100,
    context: request.context ?? 'Formulate causal feature combinations with zero look-ahead bias.',
  });

  return {
    capability: 'feature_proposal',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} All proposed features MUST be causal and mathematically grounded.`,
    userPrompt,
    temperature: 0.1,
  };
}

export function formatFailureDiagnosisPrompt(request: ExplainFailureRequest): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'diagnose_failure',
    jobId: request.jobId,
    hypothesis: request.hypothesis,
    reasons: request.reasons,
    metrics: request.metrics ?? {},
    summary: request.summary ?? `Job ${request.jobId} failure analysis`,
  });

  return {
    capability: 'failure_diagnosis',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Analyze survival gate failure reasons and backtest metrics.`,
    userPrompt,
    temperature: 0.0,
  };
}

export function formatClusteringPrompt(request: ClusterHypothesesRequest): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'cluster_hypotheses',
    hypotheses: request.hypotheses,
    similarityThreshold: request.similarityThreshold ?? 0.7,
  });

  return {
    capability: 'hypothesis_clustering',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Identify semantic duplicates and group hypotheses by economic premise.`,
    userPrompt,
    temperature: 0.0,
  };
}

export function formatNextExperimentPrompt(
  request: RecommendExperimentsRequest,
): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'recommend_next_experiments',
    completedJobId: request.completedJobId ?? request.predecessorJobId,
    hypothesis: request.hypothesis,
    status: request.status ?? request.outcome ?? 'FALSIFIED',
    failureReasons: request.failureReasons ?? [],
    targetRegime: request.currentRegime ?? 'all',
    maxRecommendations: request.maxRecommendations ?? 2,
  });

  return {
    capability: 'next_experiment',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Recommend lineage-linked follow-up experiment specifications.`,
    userPrompt,
    temperature: 0.1,
  };
}
