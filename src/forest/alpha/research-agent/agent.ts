import {
  parseRawJson, HypothesisProposalSchema, FeatureProposalSchema, FailureDiagnosisSchema,
  GenerateHypothesesRequestSchema, ProposeFeaturesRequestSchema, ExplainFailureRequestSchema,
  ClusterHypothesesRequestSchema, RecommendExperimentsRequestSchema,
} from './schemas';
import type {
  HypothesisProposal, FeatureProposal, FailureDiagnosis,
  HypothesisCluster, NextExperimentSpec, GenerateHypothesesRequest, ProposeFeaturesRequest,
  ExplainFailureRequest, ClusterHypothesesRequest, RecommendExperimentsRequest,
} from './types';
import { formatHypothesisPrompt, formatFeatureProposalPrompt, formatFailureDiagnosisPrompt } from './provider';
import { extractItems } from './agent-validation-matcher';
import { filterSafeHypotheses } from './agent-falsification-filter';
import { AgentValidationError, wrapSchemaError, type ResearchAgentDeps } from './agent-errors';
import { validateFeatureCausality } from './agent-causality';
import { runClusterHypotheses, runRecommendNextExperiments } from './agent-clustering-recommender';
export { AgentValidationError, FalsificationGuardError, NonCausalFeatureError, type ResearchAgentDeps } from './agent-errors';

export class ResearchAgent {
  constructor(private readonly deps: ResearchAgentDeps) {}
  public async generateHypotheses(r: GenerateHypothesesRequest): Promise<readonly HypothesisProposal[]> {
    const req = wrapSchemaError(() => GenerateHypothesesRequestSchema.parse(r), 'generateHypotheses request');
    const raw = await this.deps.provider.generateCompletion(formatHypothesisPrompt(req));
    const list = wrapSchemaError(() => HypothesisProposalSchema.array().parse(extractItems(parseRawJson(raw, 'generateHypotheses'), 'proposals')), 'generateHypotheses');
    return filterSafeHypotheses(list, req.falsifiedClassesToExclude ?? [], req.strictFalsificationBlock).slice(0, req.maxProposals);
  }
  public async proposeFeatureCombinations(r: ProposeFeaturesRequest): Promise<readonly FeatureProposal[]> {
    const req = wrapSchemaError(() => ProposeFeaturesRequestSchema.parse(r), 'proposeFeatureCombinations request');
    const raw = await this.deps.provider.generateCompletion(formatFeatureProposalPrompt(req));
    const proposals = wrapSchemaError(() => FeatureProposalSchema.array().parse(extractItems(parseRawJson(raw, 'proposeFeatureCombinations'), 'proposals')), 'proposeFeatureCombinations');
    for (const p of proposals) validateFeatureCausality(p);
    return proposals;
  }
  public async explainFailure(r: ExplainFailureRequest): Promise<FailureDiagnosis> {
    const req = wrapSchemaError(() => ExplainFailureRequestSchema.parse(r), 'explainFailure request');
    const raw = await this.deps.provider.generateCompletion(formatFailureDiagnosisPrompt(req));
    const parsed = parseRawJson(raw, 'explainFailure');
    if (!parsed || typeof parsed !== 'object') throw new AgentValidationError(`Completion response must be an object, received ${typeof parsed}`);
    const item = ('diagnosis' in parsed && (parsed as Record<string, unknown>).diagnosis) || parsed;
    return { ...wrapSchemaError(() => FailureDiagnosisSchema.parse(item), 'explainFailure'), jobId: req.jobId };
  }
  public async clusterHypotheses(r: ClusterHypothesesRequest): Promise<readonly HypothesisCluster[]> {
    const req = wrapSchemaError(() => ClusterHypothesesRequestSchema.parse(r), 'clusterHypotheses request');
    return runClusterHypotheses(this.deps.provider, req);
  }
  public async recommendNextExperiments(r: RecommendExperimentsRequest): Promise<readonly NextExperimentSpec[]> {
    const req = wrapSchemaError(() => RecommendExperimentsRequestSchema.parse(r), 'recommendNextExperiments request');
    return runRecommendNextExperiments(this.deps.provider, req);
  }
}
