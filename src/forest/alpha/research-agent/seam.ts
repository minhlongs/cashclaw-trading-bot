// CashClaw Alpha Research OS — Phase 7 ResearchAgent Seam
// Master Mission §10 / R4: Integration seam connecting ResearchAgent to ResearchQueueJob & SurvivalVerdict.
// Layer invariant: Resides in Forest layer; imports Tree types; Tree never imports Forest.
import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { SurvivalVerdict } from '@/forest/alpha/multiple-testing/types';
import type { ResearchAgent } from './agent';
import type { FailureDiagnosis, NextExperimentSpec, ExplainFailureRequest, RecommendExperimentsRequest } from './types';
import {
  type FollowUpJobOptions,
  INCOMPLETE_STATES,
  extractFailureReasons,
  extractJobMetrics,
  createFollowUpJobSpec,
} from './seam-job-extractors';

export type { FollowUpJobOptions };
export { createFollowUpJobSpec };

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
