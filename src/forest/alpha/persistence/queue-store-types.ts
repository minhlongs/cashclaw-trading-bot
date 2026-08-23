// Research Queue Persistence — Types
// Append-only store contract for the research queue (migration 0010).
// INSERT/SELECT only: current state is a fold over events, never a
// mutation of an existing row.

import type {
  QueueState,
  QueueTrigger,
  ResearchQueueJob,
} from '@/tree/alpha/queue/types';

/** One append-only transition event for a queue job. */
export interface QueueEventRecord {
  /** Unique event identifier. */
  readonly eventId: string;
  /** Job the event belongs to. */
  readonly jobId: string;
  /** State before the transition (null for the initial enqueue event). */
  readonly fromStatus: QueueState | null;
  /** State after the transition. */
  readonly toStatus: QueueState;
  /** Trigger that produced the transition. */
  readonly trigger: QueueTrigger;
  /** Serialized payload (result / verdict / reasons), null when absent. */
  readonly payloadJson: string | null;
  /** Unix timestamp (ms) when the event was recorded. */
  readonly createdAt: number;
}

/** One append-only snapshot of the multiple-testing counters. */
export interface CounterSnapshot {
  /** Unique snapshot identifier. */
  readonly snapshotId: string;
  /** Serialized MultipleTestingCounters payload. */
  readonly countersJson: string;
  /** Unix timestamp (ms) when the snapshot was recorded. */
  readonly createdAt: number;
}

/**
 * Append-only persistence contract for the research queue.
 * Implementations must only issue INSERT and SELECT statements.
 */
export interface ResearchQueueStore {
  /** Insert one job row. Duplicate job ids fail at the primary key. */
  appendJob(job: ResearchQueueJob): Promise<void>;

  /** Append one transition event. */
  appendEvent(event: QueueEventRecord): Promise<void>;

  /** List all jobs, newest first (by created_at). */
  listJobs(): Promise<ResearchQueueJob[]>;

  /** Load the event history for one job, oldest first. */
  loadEvents(jobId: string): Promise<QueueEventRecord[]>;

  /** Append one counter snapshot. */
  appendCounterSnapshot(snapshot: CounterSnapshot): Promise<void>;
}
