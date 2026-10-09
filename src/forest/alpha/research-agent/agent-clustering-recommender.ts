import { parseRawJson, HypothesisClusterSchema, NextExperimentSpecSchema } from './schemas';
import type { ResearchLLMProvider, HypothesisCluster, NextExperimentSpec, ClusterHypothesesRequest, RecommendExperimentsRequest } from './types';
import { formatClusteringPrompt, formatNextExperimentPrompt } from './provider';
import { extractItems } from './agent-validation-matcher';
import { wrapSchemaError } from './agent-errors';

export async function runClusterHypotheses(provider: ResearchLLMProvider, req: ClusterHypothesesRequest): Promise<readonly HypothesisCluster[]> {
  if (req.hypotheses.length === 0) return [];
  if (req.hypotheses.length === 1) {
    const single = req.hypotheses[0]!;
    return [{ clusterId: `cluster-${single.id}`, theme: single.title, memberIds: [single.id], redundancyScore: 0, recommendedRepresentativeId: single.id }];
  }
  const raw = await provider.generateCompletion(formatClusteringPrompt(req));
  const items = extractItems(parseRawJson(raw, 'clusterHypotheses'), 'clusters');
  return wrapSchemaError(() => HypothesisClusterSchema.array().parse(items), 'clusterHypotheses');
}

export async function runRecommendNextExperiments(provider: ResearchLLMProvider, req: RecommendExperimentsRequest): Promise<readonly NextExperimentSpec[]> {
  const raw = await provider.generateCompletion(formatNextExperimentPrompt(req));
  const items = extractItems(parseRawJson(raw, 'recommendNextExperiments'), 'recommendations');
  const specs = wrapSchemaError(() => NextExperimentSpecSchema.array().min(1).parse(items), 'recommendNextExperiments');
  const parentJobId = req.completedJobId ?? req.predecessorJobId;
  return specs.slice(0, req.maxRecommendations).map((spec) => ({ ...spec, parentJobId: spec.parentJobId ?? parentJobId }));
}
