// Research Queue — pure functions.
// Immutable operations: every function returns a new queue and never
// mutates its input. No I/O, no randomness, no Node APIs.

export { fnv1a32, jobConfigHash } from './queue-hash';
export {
  QUEUE_STATE_ORDER,
  createQueue,
  enqueue,
  transitionQueueJob,
  summarizeQueue,
} from './queue-ops';
