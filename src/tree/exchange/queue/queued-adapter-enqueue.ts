// Enqueue and wait execution engine for QueuedExchangeAdapter

import type { ExchangeId } from '../types';
import type { RequestQueue } from './request-queue';
import type { RequestPriority } from './types';
import { getCostForMethod } from './queued-adapter-cost';
import { createLogger } from '@/lib/logger';

const log = createLogger('queued-adapter');

export interface ExchangeEnqueueDeps {
  queue: RequestQueue;
  exchange: ExchangeId;
  getNow: () => number;
}

function recordCost(deps: ExchangeEnqueueDeps, method: string, start: number): void {
  const cost = getCostForMethod(method);
  const latencyMs = deps.getNow() - start;
  deps.queue.recordCost(deps.exchange, cost);
  log.debug('API call recorded', {
    exchange: deps.exchange,
    method,
    cost,
    latencyMs,
  });
}

/**
 * Enqueue an exchange call and wait for it to complete.
 * Handles queue-full and budget-exceeded fallbacks gracefully.
 */
export async function enqueueAndWaitExchange<T>(
  deps: ExchangeEnqueueDeps,
  method: string,
  priority: RequestPriority,
  execute: () => Promise<T>,
): Promise<T> {
  const cost = getCostForMethod(method);
  const label = `${deps.exchange}:${method}`;

  // Enqueue and immediately dequeue — we need the result now
  const id = deps.queue.enqueue({
    priority,
    exchange: deps.exchange,
    cost,
    execute,
    label,
  });

  if (!id) {
    // Queue full or budget exceeded — fall back to direct execution
    log.warn('Queue rejected, falling back to direct execution', {
      method,
      exchange: deps.exchange,
    });
    const start = deps.getNow();
    try {
      return await execute();
    } finally {
      recordCost(deps, method, start);
    }
  }

  // Dequeue the item we just enqueued (it's at the front)
  const item = deps.queue.dequeue(deps.exchange);
  if (!item) {
    // Defensive fallback if dequeue returns null
    const start = deps.getNow();
    try {
      return await execute();
    } finally {
      recordCost(deps, method, start);
    }
  }

  // Execute and track cost
  const start = deps.getNow();
  try {
    return (await item.execute()) as T;
  } finally {
    recordCost(deps, method, start);
  }
}
