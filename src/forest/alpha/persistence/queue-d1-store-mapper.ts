// D1 row mappers for research queue jobs and events.
// Maps raw D1 rows to typed domain objects (append-only doctrine).

import type { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type {
  ResearchCosts,
  ResearchResult,
  ResearchSlippage,
} from '@/tree/alpha/registry/types';
import type {
  QueueState,
  QueueTrigger,
  ResearchQueueJob,
} from '@/tree/alpha/queue/types';
import type { QueueEventRecord } from './queue-store-types';

export interface JobRow {
  job_id: string;
  hypothesis: string;
  rationale: string;
  features_json: string;
  dataset: string;
  regime: string;
  universe_json: string;
  costs_json: string;
  slippage_json: string;
  seed: number | null;
  parent_hypothesis: string | null;
  generated_by: string;
  timestamp: number;
  git_sha: string | null;
  status: string;
  config_hash: string;
  result_json: string | null;
  created_at: number;
}

export interface EventRow {
  event_id: string;
  job_id: string;
  from_status: string | null;
  to_status: string;
  trigger: string;
  payload_json: string | null;
  created_at: number;
}

export function rowToJob(row: JobRow): ResearchQueueJob {
  return {
    id: row.job_id,
    hypothesis: row.hypothesis,
    rationale: row.rationale,
    features: JSON.parse(row.features_json) as string[],
    dataset: row.dataset,
    regime: row.regime as RegimeLabel,
    universe: JSON.parse(row.universe_json) as Universe,
    costs: JSON.parse(row.costs_json) as ResearchCosts,
    slippage: JSON.parse(row.slippage_json) as ResearchSlippage,
    seed: row.seed,
    parentHypothesis: row.parent_hypothesis,
    generatedBy: row.generated_by,
    timestamp: row.timestamp,
    gitSha: row.git_sha,
    status: row.status as QueueState,
    configHash: row.config_hash,
    result: row.result_json === null
      ? null
      : (JSON.parse(row.result_json) as ResearchResult),
  };
}

export function rowToEvent(row: EventRow): QueueEventRecord {
  return {
    eventId: row.event_id,
    jobId: row.job_id,
    fromStatus: row.from_status as QueueState | null,
    toStatus: row.to_status as QueueState,
    trigger: row.trigger as QueueTrigger,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
  };
}
