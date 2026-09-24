// Cost-Aware Request Queue — Operations and Actions

import type { ExchangeId } from '../types';
import { CostTracker } from './cost-tracker';
import { RequestQueuePool } from './request-queue-pool';
import { drainExchangeQueue } from './request-queue-drain';
import {
  RequestPriority,
  type QueueConfig,
  type QueueItem,
  type DrainResult,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('request-queue');

export class RequestQueueActions {
  protected pool = new RequestQueuePool();
  protected costTracker: CostTracker;
  protected config: QueueConfig;
  protected idCounter = 0;

  constructor(config: QueueConfig, costTracker: CostTracker) {
    this.config = config;
    this.costTracker = costTracker;
  }

  enqueue<T>(item: Omit<QueueItem<T>, 'id' | 'enqueuedAt'>): string | null {
    const exchange = item.exchange;
    const maxDepth = this.config.maxDepth[exchange] ?? 100;
    if (!this.pool.canEnqueue(exchange, maxDepth)) {
      log.warn('Request rejected: queue full', {
        exchange,
        depth: this.pool.getDepth(exchange),
        maxDepth,
        priority: item.priority,
      });
      return null;
    }

    const id = `req_${++this.idCounter}_${Date.now()}`;
    const fullItem: QueueItem<T> = {
      ...item,
      id,
      enqueuedAt: Date.now(),
    };

    this.pool.enqueue(exchange, fullItem as QueueItem);

    log.debug('Request enqueued', {
      id,
      exchange,
      priority: item.priority,
      label: item.label,
      depth: this.pool.getDepth(exchange),
    });

    return id;
  }

  dequeue(exchange: ExchangeId): QueueItem | null {
    if (this.costTracker.isOverBudget(exchange)) {
      return null;
    }
    return this.pool.dequeue(exchange);
  }

  canEnqueue(exchange: ExchangeId): boolean {
    const maxDepth = this.config.maxDepth[exchange] ?? 100;
    return this.pool.canEnqueue(exchange, maxDepth);
  }

  getDepth(exchange: ExchangeId, priority?: RequestPriority): number {
    return this.pool.getDepth(exchange, priority);
  }

  getTotalDepth(): number {
    return this.pool.getTotalDepth();
  }

  async drain(
    exchange: ExchangeId,
    processor: (item: QueueItem) => Promise<boolean>,
  ): Promise<DrainResult> {
    return drainExchangeQueue({
      exchange,
      queue: this.pool.getQueue(exchange),
      costTracker: this.costTracker,
      batchSize: this.config.drainBatchSize,
      processor,
    });
  }

  remove(exchange: ExchangeId, itemId: string): boolean {
    return this.pool.remove(exchange, itemId);
  }

  peek(exchange: ExchangeId, count = 5): QueueItem[] {
    return this.pool.peek(exchange, count);
  }

  clear(): void {
    this.pool.clear();
  }

  getCostSnapshot() {
    return this.costTracker.snapshot();
  }

  recordCost(exchange: ExchangeId, cost: number): void {
    this.costTracker.record(exchange, cost);
  }
}