// Research Queue — Core Operations
// Enqueue, transition, and summary operations. Pure and immutable.

import { transitionJob } from './transitions';
import { jobConfigHash } from './queue-hash';
import type {
  QueueJobSpec,
  QueueState,
  QueueSummary,
  QueueTrigger,
  ResearchQueue,
  ResearchQueueJob,
} from './types';

export const QUEUE_STATE_ORDER: readonly QueueState[] = [
  'PROPOSED',
  'VALIDATING',
  'RUNNING',
  'EVALUATED',
  'SURVIVED',
  'FALSIFIED',
  'ARCHIVED',
];

function emptyCounts(): Record<QueueState, number> {
  return {
    PROPOSED: 0,
    VALIDATING: 0,
    RUNNING: 0,
    EVALUATED: 0,
    SURVIVED: 0,
    FALSIFIED: 0,
    ARCHIVED: 0,
  };
}

/** Create an empty queue. */
export function createQueue(): ResearchQueue {
  return { jobs: [] };
}

/**
 * Enqueue a job, returning a NEW queue.
 *
 * Fail-closed guards:
 * - id, hypothesis, rationale, dataset, generatedBy must be non-empty;
 * - duplicate id is rejected;
 * - duplicate configuration hash among non-ARCHIVED jobs is rejected
 *   (duplicate-research prevention — the error names the colliding id).
 */
export function enqueue(queue: ResearchQueue, spec: QueueJobSpec): ResearchQueue {
  if (spec.id.trim() === '') {
    throw new Error('Queue job id must be non-empty');
  }
  if (spec.hypothesis.trim() === '') {
    throw new Error('Queue job hypothesis must be non-empty');
  }
  if (spec.rationale.trim() === '') {
    throw new Error('Queue job rationale must be non-empty');
  }
  if (spec.dataset.trim() === '') {
    throw new Error('Queue job dataset must be non-empty');
  }
  if (spec.generatedBy.trim() === '') {
    throw new Error('Queue job generatedBy must be non-empty');
  }
  if (queue.jobs.some((job) => job.id === spec.id)) {
    throw new Error(`Duplicate queue job id: ${spec.id}`);
  }
  const hash = jobConfigHash(spec);
  const duplicate = queue.jobs.find(
    (job) => job.status !== 'ARCHIVED' && job.configHash === hash,
  );
  if (duplicate) {
    throw new Error(
      `Duplicate queue job configuration (collides with id '${duplicate.id}', hash ${hash}): ${spec.hypothesis}`,
    );
  }
  const job: ResearchQueueJob = {
    ...spec,
    status: 'PROPOSED',
    configHash: hash,
    result: null,
  };
  return { jobs: [...queue.jobs, job] };
}

/**
 * Apply a trigger to a job by id, returning a NEW queue.
 * Throws on unknown id or illegal transition (fail closed).
 */
export function transitionQueueJob(
  queue: ResearchQueue,
  id: string,
  trigger: QueueTrigger,
): ResearchQueue {
  const target = queue.jobs.find((job) => job.id === id);
  if (!target) {
    throw new Error(`Cannot transition unknown queue job id: ${id}`);
  }
  const { to } = transitionJob(target.status, trigger);
  const jobs = queue.jobs.map((job) =>
    job.id === id ? { ...job, status: to } : job,
  );
  return { jobs };
}

/** Aggregate counts of jobs by lifecycle state. */
export function summarizeQueue(queue: ResearchQueue): QueueSummary {
  const counts = emptyCounts();
  for (const job of queue.jobs) {
    counts[job.status] += 1;
  }
  return { total: queue.jobs.length, counts };
}
