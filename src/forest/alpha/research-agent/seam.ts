// CashClaw Alpha Research OS — Phase 7 ResearchAgent Seam
// Master Mission §10 / R4: Integration seam connecting ResearchAgent to ResearchQueueJob & SurvivalVerdict.
// Layer invariant: Resides in Forest layer; imports Tree types; Tree never imports Forest.
import type { ResearchQueueJob, QueueJobSpec } from '@/tree/alpha/queue/types';
import type { SurvivalVerdict } from '@/forest/alpha/multiple-testing/types';
import type { ResearchCosts, ResearchSlippage } from '@/tree/alpha/registry/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type { ResearchAgent } from './agent';
import type { FailureDiagnosis, NextExperimentSpec, ExplainFailureRequest, RecommendExperimentsRequest } from './types';

export interface FollowUpJobOptions {
  readonly id?: string;
  readonly generatedBy?: string;
  readonly costs?: ResearchCosts;
  readonly slippage?: ResearchSlippage;
  readonly gitSha?: string | null;
}

const INCOMPLETE_STATES: readonly string[] = ['PROPOSED', 'VALIDATING', 'RUNNING'];

function extractFailureReasons(job: ResearchQueueJob, verdict?: SurvivalVerdict): string[] {
  if (verdict?.reasons && verdict.reasons.length > 0) return [...verdict.reasons];
  if (job.result?.summary) return [job.result.summary];
  return [job.status === 'FALSIFIED' ? `Job '${job.id}' falsified during queue evaluation` : `Job '${job.id}' failed to survive evaluation`];
}

function extractJobMetrics(job: ResearchQueueJob): Record<string, number> {
  const metrics: Record<string, number> = {};
  if (job.result) {
    metrics.oosPassCount = job.result.oosPassCount;
    metrics.oosTotalCount = job.result.oosTotalCount;
    metrics.aggregatePnlUsd = job.result.aggregatePnlUsd;
    if (job.result.oosTotalCount > 0) {
      metrics.oosPassRate = job.result.oosPassCount / job.result.oosTotalCount;
    }
  }
  if (job.costs) {
    metrics.feeBps = job.costs.feeBps;
    metrics.impactBps = job.costs.impactBps;
    metrics.totalCostBps = job.costs.feeBps + job.costs.impactBps;
  }
  if (job.slippage) {
    metrics.slippageBps = job.slippage.slippageBps;
  }
  return metrics;
}

export async function diagnoseQueueJobFailure(
  agent: ResearchAgent,
  job: ResearchQueueJob,
  verdict?: SurvivalVerdict,
): Promise<FailureDiagnosis> {
  if (INCOMPLETE_STATES.includes(job.status)) {
    throw new Error(`Cannot diagnose failure for incomplete job '${job.id}' in state '${job.status}'`);
  }
  if (verdict && verdict.verdict === 'survived') {
    throw new Error(`Cannot diagnose failure: verdict for job '${job.id}' is 'survived'`);
  }
  if (job.status === 'SURVIVED' && (!verdict || verdict.verdict === 'survived')) {
    throw new Error(`Cannot diagnose failure: job '${job.id}' has status SURVIVED`);
  }

  const reasons = extractFailureReasons(job, verdict);
  const metrics = extractJobMetrics(job);

  const request: ExplainFailureRequest = {
    jobId: job.id,
    hypothesisId: job.id,
    hypothesis: job.hypothesis,
    verdict,
    reasons,
    metrics,
    summary: job.result?.summary ?? `Job ${job.id} failure analysis`,
  };

  const diagnosis = await agent.explainFailure(request);
  return { ...diagnosis, jobId: job.id };
}

export async function recommendQueueFollowUp(
  agent: ResearchAgent,
  job: ResearchQueueJob,
  verdict?: SurvivalVerdict,
): Promise<NextExperimentSpec> {
  if (INCOMPLETE_STATES.includes(job.status)) {
    throw new Error(`Cannot recommend follow-up for incomplete job '${job.id}' in state '${job.status}'`);
  }

  const status: 'SURVIVED' | 'FALSIFIED' = verdict
    ? verdict.verdict === 'survived' ? 'SURVIVED' : 'FALSIFIED'
    : job.status === 'SURVIVED' ? 'SURVIVED' : 'FALSIFIED';

  const failureReasons = status === 'FALSIFIED' ? extractFailureReasons(job, verdict) : [];

  const request: RecommendExperimentsRequest = {
    completedJobId: job.id,
    hypothesisId: job.id,
    hypothesis: job.hypothesis,
    status,
    verdict,
    failureReasons,
    currentRegime: job.regime,
    currentFeatures: [...job.features],
    currentDataset: job.dataset,
    maxRecommendations: 1,
  };

  const recommendations = await agent.recommendNextExperiments(request);
  if (!recommendations || recommendations.length === 0) {
    throw new Error(`ResearchAgent returned no recommendations for job '${job.id}'`);
  }

  const primarySpec = recommendations[0];
  return {
    ...primarySpec,
    parentJobId: primarySpec.parentJobId ?? job.id,
  };
}

export function createFollowUpJobSpec(
  job: ResearchQueueJob,
  spec: NextExperimentSpec,
  options: FollowUpJobOptions = {},
): QueueJobSpec {
  const params = (spec.proposedParameters as Record<string, unknown> | undefined) ?? {};

  const features = Array.isArray(params.features) && params.features.length > 0
    ? (params.features as readonly string[])
    : job.features;

  const dataset = typeof params.dataset === 'string' && params.dataset.length > 0
    ? params.dataset
    : job.dataset;

  const regime = (spec.targetRegime as RegimeLabel | undefined) || job.regime;
  const universe = (params.universe as Universe | undefined) || job.universe;

  return {
    id: options.id ?? `job-${spec.hypothesisId}-${Date.now().toString(36)}`,
    hypothesis: spec.title || `${job.hypothesis} (follow-up)`,
    rationale: spec.rationale,
    features,
    dataset,
    regime,
    universe,
    costs: options.costs ?? job.costs,
    slippage: options.slippage ?? job.slippage,
    seed: null,
    parentHypothesis: job.id,
    generatedBy: options.generatedBy ?? 'research-agent-seam',
    timestamp: Date.now(),
    gitSha: options.gitSha !== undefined ? options.gitSha : job.gitSha,
  };
}
