// CashClaw Alpha Research OS — Phase 7 ResearchAgent Safe Role Only
// Master Mission §10: Untrusted research assistant with fail-closed safety fences.
import { declareFeature } from '@/tree/alpha/indicator-types';
import { MICROSTRUCTURE_FEATURE_NAMES } from '@/tree/alpha/microstructure/contracts';
import {
  parseRawJson, HypothesisProposalSchema, FeatureProposalSchema, FailureDiagnosisSchema,
  HypothesisClusterSchema, NextExperimentSpecSchema, GenerateHypothesesRequestSchema,
  ProposeFeaturesRequestSchema, ExplainFailureRequestSchema, ClusterHypothesesRequestSchema,
  RecommendExperimentsRequestSchema,
} from './schemas';
import type {
  ResearchLLMProvider, HypothesisProposal, FeatureProposal, FailureDiagnosis,
  HypothesisCluster, NextExperimentSpec, GenerateHypothesesRequest, ProposeFeaturesRequest,
  ExplainFailureRequest, ClusterHypothesesRequest, RecommendExperimentsRequest,
} from './types';
import {
  formatHypothesisPrompt, formatFeatureProposalPrompt, formatFailureDiagnosisPrompt,
  formatClusteringPrompt, formatNextExperimentPrompt,
} from './provider';
import {
  AgentValidationError,
  extractItems,
  matchFalsified,
} from './agent-validation-matcher';

export { AgentValidationError };
export class ResearchAgentError extends Error { constructor(m: string) { super(m); this.name = 'ResearchAgentError'; } }
export class FalsificationGuardError extends ResearchAgentError { constructor(m: string) { super(m); this.name = 'FalsificationGuardError'; } }
export class NonCausalFeatureError extends ResearchAgentError { constructor(m: string) { super(m); this.name = 'NonCausalFeatureError'; } }

export interface ResearchAgentDeps { readonly provider: ResearchLLMProvider; }

export class ResearchAgent {
  private readonly provider: ResearchLLMProvider;

  constructor(deps: ResearchAgentDeps) {
    this.provider = deps.provider;
  }

  public async generateHypotheses(request: GenerateHypothesesRequest): Promise<readonly HypothesisProposal[]> {
    const req = GenerateHypothesesRequestSchema.parse(request);
    const raw = await this.provider.generateCompletion(formatHypothesisPrompt(req));
    const items = extractItems(parseRawJson(raw, 'generateHypotheses'), 'proposals');
    const proposals = HypothesisProposalSchema.array().parse(items);
    const excludedIds = new Set((req.falsifiedClassesToExclude ?? []).map((s) => s.toLowerCase()));
    const safe: HypothesisProposal[] = [];

    for (const proposal of proposals) {
      const match = matchFalsified(proposal, excludedIds);
      if (match) {
        if (req.strictFalsificationBlock) {
          throw new FalsificationGuardError(`Hypothesis '${proposal.title}' replicates falsified class '${match}' and is blocked.`);
        }
        continue;
      }
      safe.push(proposal);
    }

    if (safe.length === 0 && proposals.length > 0 && req.strictFalsificationBlock) {
      throw new FalsificationGuardError('All proposed hypotheses replicate falsified classes.');
    }
    return safe.slice(0, req.maxProposals);
  }

  public async proposeFeatureCombinations(request: ProposeFeaturesRequest): Promise<readonly FeatureProposal[]> {
    const req = ProposeFeaturesRequestSchema.parse(request);
    const raw = await this.provider.generateCompletion(formatFeatureProposalPrompt(req));
    const items = extractItems(parseRawJson(raw, 'proposeFeatureCombinations'), 'proposals');
    const proposals = FeatureProposalSchema.array().parse(items);
    for (const proposal of proposals) this.validateFeatureCausality(proposal);
    return proposals;
  }

  public async explainFailure(request: ExplainFailureRequest): Promise<FailureDiagnosis> {
    const req = ExplainFailureRequestSchema.parse(request);
    const raw = await this.provider.generateCompletion(formatFailureDiagnosisPrompt(req));
    const parsed = parseRawJson(raw, 'explainFailure');
    if (!parsed || typeof parsed !== 'object') {
      throw new AgentValidationError(`Completion response must be an object, received ${typeof parsed}`);
    }
    const item = ('diagnosis' in parsed && (parsed as Record<string, unknown>).diagnosis) || parsed;
    const diagnosis = FailureDiagnosisSchema.parse(item);
    return { ...diagnosis, jobId: req.jobId };
  }

  public async clusterHypotheses(request: ClusterHypothesesRequest): Promise<readonly HypothesisCluster[]> {
    const req = ClusterHypothesesRequestSchema.parse(request);
    if (req.hypotheses.length === 0) return [];
    if (req.hypotheses.length === 1) {
      const single = req.hypotheses[0]!;
      return [{
        clusterId: `cluster-${single.id}`,
        theme: single.title,
        memberIds: [single.id],
        redundancyScore: 0,
        recommendedRepresentativeId: single.id,
      }];
    }
    const raw = await this.provider.generateCompletion(formatClusteringPrompt(req));
    const items = extractItems(parseRawJson(raw, 'clusterHypotheses'), 'clusters');
    return HypothesisClusterSchema.array().parse(items);
  }

  public async recommendNextExperiments(request: RecommendExperimentsRequest): Promise<readonly NextExperimentSpec[]> {
    const req = RecommendExperimentsRequestSchema.parse(request);
    const raw = await this.provider.generateCompletion(formatNextExperimentPrompt(req));
    const items = extractItems(parseRawJson(raw, 'recommendNextExperiments'), 'recommendations');
    const specs = NextExperimentSpecSchema.array().min(1).parse(items);
    const parentJobId = req.completedJobId ?? req.predecessorJobId;

    return specs.slice(0, req.maxRecommendations).map((spec) => ({
      ...spec,
      parentJobId: spec.parentJobId ?? parentJobId,
    }));
  }

  private validateFeatureCausality(proposal: FeatureProposal): void {
    const isSuspicious =
      proposal.combinationLogic.toLowerCase().includes('lead(') ||
      proposal.causalJustification.toLowerCase().includes('future') ||
      proposal.indicators.some((ind) => /t_plus|future|lead|t\+/i.test(ind));

    for (const indicator of proposal.indicators) {
      const isMicro = MICROSTRUCTURE_FEATURE_NAMES.includes(indicator as never);
      try {
        declareFeature({
          name: indicator,
          timeframe: '1m',
          source: isMicro ? 'orderbook' : 'ohlcv',
          lookback: proposal.lookbackPeriods[0] ?? 1,
          availability: 'when_listed',
          causal: !isSuspicious,
        });
      } catch (err) {
        throw new NonCausalFeatureError(`Feature '${indicator}' failed causality check: ${(err as Error).message}`);
      }
    }
  }
}
