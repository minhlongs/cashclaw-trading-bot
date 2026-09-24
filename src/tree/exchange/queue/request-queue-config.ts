// Cost-Aware Request Queue — Configuration Resolution

import { CostTracker } from './cost-tracker';
import {
  DEFAULT_QUEUE_CONFIG,
  type QueueConfig,
} from './types';

export function resolveQueueConfig(partial: Partial<QueueConfig> = {}): {
  config: QueueConfig;
  costTracker: CostTracker;
} {
  const config: QueueConfig = { ...DEFAULT_QUEUE_CONFIG, ...partial };
  const costTracker = new CostTracker({ budget: config.dailyBudget });
  return { config, costTracker };
}

export type { QueueConfig };