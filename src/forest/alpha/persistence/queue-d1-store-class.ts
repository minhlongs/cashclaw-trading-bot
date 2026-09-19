// D1-backed implementation of ResearchQueueStore.
// INSERT/SELECT only (append-only doctrine, migration 0010). Typed
// against the inlined D1Database interface (Workers-safe).

import type { D1Database } from '@/lib/db/types';
import type {
  ResearchQueueStore,
  QueueEventRecord,
  CounterSnapshot,
} from './queue-store-types';
import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import { rowToJob, rowToEvent, type JobRow, type EventRow } from './queue-d1-store-mapper';
import {
  SQL_APPEND_JOB,
  SQL_APPEND_EVENT,
  SQL_LIST_JOBS,
  SQL_LOAD_EVENTS,
  SQL_APPEND_COUNTER,
} from './queue-d1-store-sql';

export class D1ResearchQueueStore implements ResearchQueueStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async appendJob(job: ResearchQueueJob): Promise<void> {
    await this.db.prepare(SQL_APPEND_JOB).bind(
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
    await this.db.prepare(SQL_APPEND_EVENT).bind(
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
    const { results } = await this.db.prepare(SQL_LIST_JOBS).all<JobRow>();
    return (results ?? []).map(rowToJob);
  }

  async loadEvents(jobId: string): Promise<QueueEventRecord[]> {
    const { results } = await this.db.prepare(SQL_LOAD_EVENTS).bind(jobId).all<EventRow>();
    return (results ?? []).map(rowToEvent);
  }

  async appendCounterSnapshot(snapshot: CounterSnapshot): Promise<void> {
    await this.db.prepare(SQL_APPEND_COUNTER)
      .bind(snapshot.snapshotId, snapshot.countersJson, snapshot.createdAt).run();
  }
}

export function createD1QueueStore(db: D1Database): D1ResearchQueueStore {
  return new D1ResearchQueueStore(db);
}
