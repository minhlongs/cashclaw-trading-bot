// CashClaw Alpha Research OS — Job Extractors and Specs for ResearchAgent Seam
import type { ResearchQueueJob, QueueJobSpec } from '@/tree/alpha/queue/types';
import type { SurvivalVerdict } from '@/forest/alpha/multiple-testing/types';
import type { ResearchCosts, ResearchSlippage } from '@/tree/alpha/registry/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type { NextExperimentSpec } from './types';

export interface FollowUpJobOptions {
  readonly id?: string;
  readonly generatedBy?: string;
  readonly costs?: ResearchCosts;
  readonly slippage?: ResearchSlippage;
  readonly gitSha?: string | null;
}

export const INCOMPLETE_STATES: readonly string[] = ['PROPOSED', 'VALIDATING', 'RUNNING'];

export function extractFailureReasons(job: ResearchQueueJob, verdict?: SurvivalVerdict): string[] {
  if (verdict?.reasons && verdict.reasons.length > 0) return [...verdict.reasons];
  if (job.result?.summary) return [job.result.summary];
  return [job.status === 'FALSIFIED' ? `Job '${job.id}' falsified during queue evaluation` : `Job '${job.id}' failed to survive evaluation`];
}

export function extractJobMetrics(job: ResearchQueueJob): Record<string, number> {
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
