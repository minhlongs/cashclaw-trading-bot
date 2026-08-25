// Research Queue — pure functions.
// Immutable operations: every function returns a new queue and never
// mutates its input. No I/O, no randomness, no Node APIs.

import { canonicalize } from '@/lib/canonical-json';
import { transitionJob } from './transitions';
import type {
  QueueJobSpec,
  QueueState,
  QueueSummary,
  QueueTrigger,
  ResearchQueue,
  ResearchQueueJob,
} from './types';

const STATE_ORDER: readonly QueueState[] = [
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

/** FNV-1a 32-bit hash over a string. Deterministic, dependency-free. */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned 32-bit, zero-padded hex for stable string form.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic hash of the job configuration only (excludes outcome
 * fields: status, result). Same configuration always yields the same
 * hash regardless of key order (canonicalize sorts keys).
 */
export function jobConfigHash(spec: QueueJobSpec): string {
  const config = {
    hypothesis: spec.hypothesis,
    features: spec.features,
    dataset: spec.dataset,
    regime: spec.regime,
    universe: spec.universe,
    costs: spec.costs,
    slippage: spec.slippage,
    seed: spec.seed,
  };
  return fnv1a32(canonicalize(config));
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

/** Lifecycle state order (for stable reporting). */
export const QUEUE_STATE_ORDER: readonly QueueState[] = STATE_ORDER;
