import type { LLMPromptPayload, GenerateHypothesesRequest, ProposeFeaturesRequest, ExplainFailureRequest } from './types';

export const BASE_SAFE_SYSTEM_PROMPT =
  'You are an untrusted quantitative research assistant for Alpha Research OS. ' +
  'You operate strictly under read-only research constraints. You have ZERO authority to execute trades, ' +
  'place orders, mutate promotion states, or alter survival thresholds. ' +
  'Respond ONLY with a valid JSON matching the requested schema. Do not include markdown commentary.';

export function formatHypothesisPrompt(request: GenerateHypothesesRequest): LLMPromptPayload {
  const excluded = (request.falsifiedClassesToExclude ?? []).join(', ');
  const userPrompt = JSON.stringify({
    task: 'generate_hypotheses', domainCategory: request.domainCategory,
    targetRegime: request.targetRegime ?? 'all', maxProposals: request.maxProposals ?? 3,
    contextPrompt: request.contextPrompt ?? 'Formulate falsifiable quantitative alpha hypotheses.',
    falsifiedClassesToAvoid: excluded || 'None specified; avoid retail TA momentum/reversion.',
  });
  return {
    capability: 'hypothesis_generation',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Propose novel hypotheses outside exhausted falsified classes.`,
    userPrompt, temperature: 0.2,
  };
}

export function formatFeatureProposalPrompt(request: ProposeFeaturesRequest): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'propose_features', targetHypothesisId: request.targetHypothesisId,
    candidateIndicators: request.candidateIndicators, maxLookback: request.maxLookback ?? 100,
    context: request.context ?? 'Formulate causal feature combinations with zero look-ahead bias.',
  });
  return {
    capability: 'feature_proposal',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} All proposed features MUST be causal and mathematically grounded.`,
    userPrompt, temperature: 0.1,
  };
}

export function formatFailureDiagnosisPrompt(request: ExplainFailureRequest): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'diagnose_failure', jobId: request.jobId, hypothesis: request.hypothesis,
    reasons: request.reasons, metrics: request.metrics ?? {},
    summary: request.summary ?? `Job ${request.jobId} failure analysis`,
  });
  return {
    capability: 'failure_diagnosis',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Analyze survival gate failure reasons and backtest metrics.`,
    userPrompt, temperature: 0.0,
  };
}
