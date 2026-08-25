// Research Queue — barrel export
// knip entry glob matches `src/tree/**/index.ts`, so this barrel satisfies
// the knip entry requirement for the whole queue module.

export type {
  QueueState,
  QueueTrigger,
  TransitionRecord,
  ResearchQueueJob,
  QueueJobSpec,
  ResearchQueue,
  QueueSummary,
} from './types';

export {
  isTerminalQueueState,
  canTransitionJob,
  getJobTransition,
  transitionJob,
} from './transitions';

export {
  jobConfigHash,
  createQueue,
  enqueue,
  transitionQueueJob,
  summarizeQueue,
  QUEUE_STATE_ORDER,
} from './queue';

export type { JobSpecValidation } from './validation';
export { validateJobSpec } from './validation';
