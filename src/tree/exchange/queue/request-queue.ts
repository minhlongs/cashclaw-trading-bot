// Cost-Aware Request Queue — priority FIFO with per-exchange capacity
// Routes exchange requests by importance. Live trades always dequeue first.
// Integrates with CostTracker for daily budget enforcement.

import type { ExchangeId } from '../types';
import { CostTracker } from './cost-tracker';
import { RequestPriority, DEFAULT_QUEUE_CONFIG, type QueueConfig, type QueueItem, type DrainResult } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('request-queue');

export class RequestQueue {
  private queues = new Map<ExchangeId, QueueItem[]>();
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

    // Check queue depth (capacity enforcement — budget is enforced at drain/dequeue)
    const queue = this.getQueue(exchange);
    const maxDepth = this.config.maxDepth[exchange] ?? 100;
    if (queue.length >= maxDepth) {
      log.warn('Request rejected: queue full', {
        exchange,
        depth: queue.length,
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

    // Insert at correct position (priority-first, then FIFO)
    this.insertByPriority(queue, fullItem);

    log.debug('Request enqueued', {
      id,
      exchange,
      priority: item.priority,
      label: item.label,
      depth: queue.length,
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

    const queue = this.getQueue(exchange);
    return queue.shift() ?? null;
  }

  /** Check if a request can be enqueued (capacity only — budget enforced at dequeue/drain) */
  canEnqueue(exchange: ExchangeId): boolean {
    const queue = this.getQueue(exchange);
    const maxDepth = this.config.maxDepth[exchange] ?? 100;
    return queue.length < maxDepth;
  }

  /** Get queue depth, optionally filtered by priority */
  getDepth(exchange: ExchangeId, priority?: RequestPriority): number {
    const queue = this.getQueue(exchange);
    if (priority === undefined) return queue.length;
    return queue.filter((item) => item.priority === priority).length;
  }

  /** Get total depth across all exchanges */
  getTotalDepth(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
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
    const result: DrainResult = {
      processed: 0,
      skipped: 0,
      pending: 0,
      byExchange: {
        binance: { processed: 0, skipped: 0, pending: 0 },
        bybit: { processed: 0, skipped: 0, pending: 0 },
        okx: { processed: 0, skipped: 0, pending: 0 },
      },
    };

    const queue = this.getQueue(exchange);
    const batchSize = this.config.drainBatchSize;

    while (result.processed < batchSize && queue.length > 0) {
      // Re-check budget before each item
      if (this.costTracker.isOverBudget(exchange)) {
        // Items remain in queue as pending — not skipped, just budget-blocked
        break;
      }

      const item = queue[0]; // peek, don't shift yet
      try {
        const success = await processor(item);
        if (success) {
          queue.shift(); // remove processed item
          this.costTracker.record(exchange, item.cost);
          result.processed++;
        } else {
          // Processor rejected (e.g. circuit open) — skip this item
          queue.shift();
          result.skipped++;
        }
      } catch (err) {
        queue.shift();
        result.skipped++;
        log.error('Drain processor error', err instanceof Error ? err : new Error(String(err)), {
          itemId: item.id,
          exchange,
        });
      }
    }

    result.pending = queue.length;
    result.byExchange[exchange] = {
      processed: result.processed,
      skipped: result.skipped,
      pending: result.pending,
    };

    return result;
  }

  /** Remove a specific item by ID (for cancellation) */
  remove(exchange: ExchangeId, itemId: string): boolean {
    const queue = this.getQueue(exchange);
    const idx = queue.findIndex((item) => item.id === itemId);
    if (idx === -1) return false;
    queue.splice(idx, 1);
    return true;
  }

  /** Peek at next items without dequeuing */
  peek(exchange: ExchangeId, count = 5): QueueItem[] {
    return this.getQueue(exchange).slice(0, count);
  }

  /** Clear all queues */
  clear(): void {
    this.queues.clear();
  }

  /** Get cost tracker snapshot for dashboard */
  getCostSnapshot() {
    return this.costTracker.snapshot();
  }

  /** Record cost externally (for calls that bypass the queue) */
  recordCost(exchange: ExchangeId, cost: number): void {
    this.costTracker.record(exchange, cost);
  }

  // ── Internal ──────────────────────────────────────────────────

  private getQueue(exchange: ExchangeId): QueueItem[] {
    let queue = this.queues.get(exchange);
    if (!queue) {
      queue = [];
      this.queues.set(exchange, queue);
    }
    return queue;
  }

  /** Binary insertion: priority ascending (lower number = higher priority), then FIFO (append) */
  private insertByPriority(queue: QueueItem[], item: QueueItem): void {
    let lo = 0;
    let hi = queue.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (queue[mid].priority <= item.priority) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    queue.splice(lo, 0, item);
  }
}
