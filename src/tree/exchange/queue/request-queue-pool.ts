// Request Queue Pool — In-memory priority queue storage per exchange
// Implements priority-first binary search insertion with stable FIFO tie-breaking.

import type { ExchangeId } from '../types';
import type { RequestPriority, QueueItem } from './types';

export class RequestQueuePool {
  private queues = new Map<ExchangeId, QueueItem[]>();

  getQueue(exchange: ExchangeId): QueueItem[] {
    let queue = this.queues.get(exchange);
    if (!queue) {
      queue = [];
      this.queues.set(exchange, queue);
    }
    return queue;
  }

  insertByPriority(queue: QueueItem[], item: QueueItem): void {
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

  enqueue(exchange: ExchangeId, item: QueueItem): void {
    const queue = this.getQueue(exchange);
    this.insertByPriority(queue, item);
  }

  dequeue(exchange: ExchangeId): QueueItem | null {
    const queue = this.getQueue(exchange);
    return queue.shift() ?? null;
  }

  canEnqueue(exchange: ExchangeId, maxDepth: number): boolean {
    const queue = this.getQueue(exchange);
    return queue.length < maxDepth;
  }

  getDepth(exchange: ExchangeId, priority?: RequestPriority): number {
    const queue = this.getQueue(exchange);
    if (priority === undefined) return queue.length;
    return queue.filter((item) => item.priority === priority).length;
  }

  getTotalDepth(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  remove(exchange: ExchangeId, itemId: string): boolean {
    const queue = this.getQueue(exchange);
    const idx = queue.findIndex((item) => item.id === itemId);
    if (idx === -1) return false;
    queue.splice(idx, 1);
    return true;
  }

  peek(exchange: ExchangeId, count = 5): QueueItem[] {
    return this.getQueue(exchange).slice(0, count);
  }

  clear(): void {
    this.queues.clear();
  }
}
