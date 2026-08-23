// Research Queue Persistence — Cloudflare D1 implementation.
// INSERT/SELECT only (append-only doctrine, migration 0010). Typed
// against the inlined D1Database interface (Workers-safe).

import type { D1Database } from '@/lib/db/types';
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
import type {
  CounterSnapshot,
  QueueEventRecord,
  ResearchQueueStore,
} from './queue-store-types';

interface JobRow {
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

interface EventRow {
  event_id: string;
  job_id: string;
  from_status: string | null;
  to_status: string;
  trigger: string;
  payload_json: string | null;
  created_at: number;
}

function rowToJob(row: JobRow): ResearchQueueJob {
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

function rowToEvent(row: EventRow): QueueEventRecord {
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

export class D1ResearchQueueStore implements ResearchQueueStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async appendJob(job: ResearchQueueJob): Promise<void> {
    await this.db.prepare(
      `INSERT INTO research_queue_jobs
       (job_id, hypothesis, rationale, features_json, dataset, regime,
        universe_json, costs_json, slippage_json, seed, parent_hypothesis,
        generated_by, timestamp, git_sha, status, config_hash, result_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      job.id,
      job.hypothesis,
      job.rationale,
      JSON.stringify(job.features),
      job.dataset,
      job.regime,
      JSON.stringify(job.universe),
      JSON.stringify(job.costs),
      JSON.stringify(job.slippage),
      job.seed,
      job.parentHypothesis,
      job.generatedBy,
      job.timestamp,
      job.gitSha,
      job.status,
      job.configHash,
      job.result === null ? null : JSON.stringify(job.result),
      job.timestamp,
    ).run();
  }

  async appendEvent(event: QueueEventRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO research_queue_events
       (event_id, job_id, from_status, to_status, "trigger", payload_json, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      event.eventId,
      event.jobId,
      event.fromStatus,
      event.toStatus,
      event.trigger,
      event.payloadJson,
      event.createdAt,
    ).run();
  }

  async listJobs(): Promise<ResearchQueueJob[]> {
    const { results } = await this.db.prepare(
      `SELECT job_id, hypothesis, rationale, features_json, dataset, regime,
              universe_json, costs_json, slippage_json, seed, parent_hypothesis,
              generated_by, timestamp, git_sha, status, config_hash, result_json, created_at
       FROM research_queue_jobs ORDER BY created_at DESC`,
    ).all<JobRow>();
    return (results ?? []).map(rowToJob);
  }

  async loadEvents(jobId: string): Promise<QueueEventRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT event_id, job_id, from_status, to_status, "trigger", payload_json, created_at
       FROM research_queue_events WHERE job_id = ? ORDER BY created_at ASC`,
    ).bind(jobId).all<EventRow>();
    return (results ?? []).map(rowToEvent);
  }

  async appendCounterSnapshot(snapshot: CounterSnapshot): Promise<void> {
    await this.db.prepare(
      `INSERT INTO research_testing_counters (snapshot_id, counters_json, created_at)
       VALUES (?,?,?)`,
    ).bind(snapshot.snapshotId, snapshot.countersJson, snapshot.createdAt).run();
  }
}

export function createD1QueueStore(db: D1Database): D1ResearchQueueStore {
  return new D1ResearchQueueStore(db);
}
