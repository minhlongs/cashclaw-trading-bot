// Cost-Aware Request Queue — priority FIFO with per-exchange capacity
// Routes exchange requests by importance. Live trades always dequeue first.
// Integrates with CostTracker for daily budget enforcement.

import { resolveQueueConfig } from './request-queue-config';
import { RequestQueueActions } from './request-queue-actions';
import type {
  QueueConfig,
  QueueItem,
  DrainResult,
} from './types';

export class RequestQueue extends RequestQueueActions {
  constructor(config: Partial<QueueConfig> = {}) {
    const { config: resolvedConfig, costTracker } = resolveQueueConfig(config);
    super(resolvedConfig, costTracker);
  }
}

export type { QueueConfig, QueueItem, DrainResult };