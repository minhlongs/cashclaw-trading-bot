// Cost-Aware Request Queue — priority FIFO with per-exchange capacity
// Routes exchange requests by importance. Live trades always dequeue first.
// Integrates with CostTracker for daily budget enforcement.

import type { ExchangeId } from '../types';
import { CostTracker } from './cost-tracker';
import { RequestQueuePool } from './request-queue-pool';
import { drainExchangeQueue } from './request-queue-drain';
import {
  RequestPriority,
  DEFAULT_QUEUE_CONFIG,
  type QueueConfig,
  type QueueItem,
  type DrainResult,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('request-queue');

export class RequestQueue {
  private pool = new RequestQueuePool();
  private costTracker: CostTracker;
  private config: QueueConfig;
  private idCounter = 0;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.costTracker = new CostTracker({ budget: this.config.dailyBudget });
  }

  /**
   * Enqueue a request. Returns the generated ID, or null if rejected
   * (queue full, over budget, duplicate ID).
   */
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

  /**
   * Dequeue the highest-priority item for an exchange.
   * Returns null if queue is empty or exchange is over budget.
   */
  dequeue(exchange: ExchangeId): QueueItem | null {
    if (this.costTracker.isOverBudget(exchange)) {
      return null;
    }
    return this.pool.dequeue(exchange);
  }

  /** Check if a request can be enqueued (capacity only — budget enforced at dequeue/drain) */
  canEnqueue(exchange: ExchangeId): boolean {
    const maxDepth = this.config.maxDepth[exchange] ?? 100;
    return this.pool.canEnqueue(exchange, maxDepth);
  }

  /** Get queue depth, optionally filtered by priority */
  getDepth(exchange: ExchangeId, priority?: RequestPriority): number {
    return this.pool.getDepth(exchange, priority);
  }

  /** Get total depth across all exchanges */
  getTotalDepth(): number {
    return this.pool.getTotalDepth();
  }

  /**
   * Process queue items until empty or batch limit hit.
   * `processor` receives each item and should call item.execute().
   * Records cost on success.
   */
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

  /** Remove a specific item by ID (for cancellation) */
  remove(exchange: ExchangeId, itemId: string): boolean {
    return this.pool.remove(exchange, itemId);
  }

  /** Peek at next items without dequeuing */
  peek(exchange: ExchangeId, count = 5): QueueItem[] {
    return this.pool.peek(exchange, count);
  }

  /** Clear all queues */
  clear(): void {
    this.pool.clear();
  }

  /** Get cost tracker snapshot for dashboard */
  getCostSnapshot() {
    return this.costTracker.snapshot();
  }

  /** Record cost externally (for calls that bypass the queue) */
  recordCost(exchange: ExchangeId, cost: number): void {
    this.costTracker.record(exchange, cost);
  }
}
