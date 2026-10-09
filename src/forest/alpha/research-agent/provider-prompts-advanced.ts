import type { LLMPromptPayload, ClusterHypothesesRequest, RecommendExperimentsRequest } from './types';
import { BASE_SAFE_SYSTEM_PROMPT } from './provider-prompts-core';

export function formatClusteringPrompt(request: ClusterHypothesesRequest): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'cluster_hypotheses', hypotheses: request.hypotheses,
    similarityThreshold: request.similarityThreshold ?? 0.7,
  });
  return {
    capability: 'hypothesis_clustering',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Identify semantic duplicates and group hypotheses by economic premise.`,
    userPrompt, temperature: 0.0,
  };
}

export function formatNextExperimentPrompt(request: RecommendExperimentsRequest): LLMPromptPayload {
  const userPrompt = JSON.stringify({
    task: 'recommend_next_experiments',
    completedJobId: request.completedJobId ?? request.predecessorJobId,
    hypothesis: request.hypothesis, status: request.status ?? request.outcome ?? 'FALSIFIED',
    failureReasons: request.failureReasons ?? [], targetRegime: request.currentRegime ?? 'all',
    maxRecommendations: request.maxRecommendations ?? 2,
  });
  return {
    capability: 'next_experiment',
    systemPrompt: `${BASE_SAFE_SYSTEM_PROMPT} Recommend lineage-linked follow-up experiment specifications.`,
    userPrompt, temperature: 0.1,
  };
}
