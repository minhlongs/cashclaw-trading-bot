// Request Queue Drain — Batch drain execution with budget and error handling

import type { ExchangeId } from '../types';
import type { CostTracker } from './cost-tracker';
import type { QueueItem, DrainResult } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('request-queue');

export interface DrainOptions {
  exchange: ExchangeId;
  queue: QueueItem[];
  costTracker: CostTracker;
  batchSize: number;
  processor: (item: QueueItem) => Promise<boolean>;
}

export async function drainExchangeQueue(options: DrainOptions): Promise<DrainResult> {
  const { exchange, queue, costTracker, batchSize, processor } = options;
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

  while (result.processed < batchSize && queue.length > 0) {
    if (costTracker.isOverBudget(exchange)) {
      break;
    }

    const item = queue[0];
    try {
      const success = await processor(item);
      if (success) {
        queue.shift();
        costTracker.record(exchange, item.cost);
        result.processed++;
      } else {
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
