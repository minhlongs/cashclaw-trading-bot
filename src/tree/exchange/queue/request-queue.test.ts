import { describe, it, expect } from 'vitest';
import { RequestQueue } from './request-queue';
import { RequestPriority, DEFAULT_QUEUE_CONFIG, type QueueItem } from './types';

function makeQueue(overrides?: Partial<typeof DEFAULT_QUEUE_CONFIG>) {
  return new RequestQueue({
    dailyBudget: { binance: 50, bybit: 80, okx: 60 },
    maxDepth: { binance: 5, bybit: 5, okx: 5 },
    drainBatchSize: 3,
    ...overrides,
  });
}

function fakeItem(overrides: Partial<QueueItem> = {}): Omit<QueueItem, 'id' | 'enqueuedAt'> {
  return {
    priority: RequestPriority.STRATEGY_EVAL,
    exchange: 'binance',
    cost: 1,
    execute: async () => 'ok',
    ...overrides,
  };
}

describe('RequestQueue', () => {
  describe('enqueue / dequeue', () => {
    it('enqueues and dequeues a single item', () => {
      const q = makeQueue();
      const id = q.enqueue(fakeItem());
      expect(id).toBeTruthy();

      const item = q.dequeue('binance');
      expect(item).toBeTruthy();
      expect(item!.id).toBe(id);
    });

    it('dequeues null when empty', () => {
      const q = makeQueue();
      expect(q.dequeue('binance')).toBeNull();
    });

    it('dequeues in priority order (lower number = first)', () => {
      const q = makeQueue();
      q.enqueue(fakeItem({ priority: RequestPriority.HISTORICAL, label: 'hist' }));
      q.enqueue(fakeItem({ priority: RequestPriority.LIVE_TRADE, label: 'live' }));
      q.enqueue(fakeItem({ priority: RequestPriority.MARKET_DATA, label: 'market' }));
      q.enqueue(fakeItem({ priority: RequestPriority.STRATEGY_EVAL, label: 'strat' }));

      const first = q.dequeue('binance')!;
      expect(first.label).toBe('live');

      const second = q.dequeue('binance')!;
      expect(second.label).toBe('strat');

      const third = q.dequeue('binance')!;
      expect(third.label).toBe('market');

      const fourth = q.dequeue('binance')!;
      expect(fourth.label).toBe('hist');
    });

    it('preserves FIFO within same priority', () => {
      const q = makeQueue();
      q.enqueue(fakeItem({ priority: RequestPriority.STRATEGY_EVAL, label: 'first' }));
      q.enqueue(fakeItem({ priority: RequestPriority.STRATEGY_EVAL, label: 'second' }));
      q.enqueue(fakeItem({ priority: RequestPriority.STRATEGY_EVAL, label: 'third' }));

      expect(q.dequeue('binance')!.label).toBe('first');
      expect(q.dequeue('binance')!.label).toBe('second');
      expect(q.dequeue('binance')!.label).toBe('third');
    });

    it('queues per exchange independently', () => {
      const q = makeQueue();
      q.enqueue(fakeItem({ exchange: 'binance', label: 'b' }));
      q.enqueue(fakeItem({ exchange: 'bybit', label: 'by' }));

      const b = q.dequeue('binance')!;
      expect(b.label).toBe('b');

      const by = q.dequeue('bybit')!;
      expect(by.label).toBe('by');
    });
  });

  describe('budget enforcement', () => {
    it('dequeue respects daily budget', () => {
      const q = makeQueue({ dailyBudget: { binance: 3, bybit: 80, okx: 60 } });

      // Enqueue 4 items (capacity allows it)
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 }));

      // Dequeue first 3 — each costs 1, total 3 = budget
      for (let i = 0; i < 3; i++) {
        const item = q.dequeue('binance');
        expect(item).not.toBeNull();
        q.recordCost('binance', 1);
      }

      // 4th dequeue should be rejected (budget exhausted)
      expect(q.dequeue('binance')).toBeNull();
    });

    it('dequeue returns null when over budget', () => {
      const q = makeQueue({ dailyBudget: { binance: 2, bybit: 80, okx: 60 } });
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 }));

      // Process first two (spends full budget)
      const item1 = q.dequeue('binance')!;
      q.recordCost('binance', item1.cost); // cost 1

      const item2 = q.dequeue('binance')!;
      q.recordCost('binance', item2.cost); // cost 2 (budget hit)

      // Should now return null
      expect(q.dequeue('binance')).toBeNull();
    });

    it('canEnqueue checks capacity only; budget enforced at dequeue', () => {
      const q = makeQueue({ dailyBudget: { binance: 5, bybit: 80, okx: 60 } });
      expect(q.canEnqueue('binance')).toBe(true);

      q.recordCost('binance', 5);
      // canEnqueue still true — budget is checked at dequeue/drain
      expect(q.canEnqueue('binance')).toBe(true);

      // dequeue blocked by budget
      expect(q.dequeue('binance')).toBeNull();
    });
  });

  describe('capacity', () => {
    it('rejects when queue depth exceeded', () => {
      const q = makeQueue({ maxDepth: { binance: 2, bybit: 5, okx: 5 } });
      q.enqueue(fakeItem());
      q.enqueue(fakeItem());

      const rejected = q.enqueue(fakeItem());
      expect(rejected).toBeNull();
    });

    it('reports depth correctly', () => {
      const q = makeQueue();
      expect(q.getDepth('binance')).toBe(0);

      q.enqueue(fakeItem());
      q.enqueue(fakeItem({ priority: RequestPriority.LIVE_TRADE }));
      expect(q.getDepth('binance')).toBe(2);
      expect(q.getDepth('binance', RequestPriority.LIVE_TRADE)).toBe(1);
      expect(q.getDepth('binance', RequestPriority.STRATEGY_EVAL)).toBe(1);
    });
  });

  describe('drain', () => {
    it('processes items up to batch size', async () => {
      const q = makeQueue({ drainBatchSize: 3 });
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 })); // 4th won't be processed (batch=3)

      const result = await q.drain('binance', async () => true);

      expect(result.processed).toBe(3);
      expect(result.pending).toBe(1);
    });

    it('records cost on successful processing', async () => {
      const q = makeQueue({ dailyBudget: { binance: 10, bybit: 80, okx: 60 } });
      q.enqueue(fakeItem({ cost: 3 }));
      q.enqueue(fakeItem({ cost: 4 }));

      await q.drain('binance', async () => true);

      expect(q.getCostSnapshot().binance.used).toBe(7);
    });

    it('skips items when processor returns false', async () => {
      const q = makeQueue({ drainBatchSize: 5 });
      q.enqueue(fakeItem({ cost: 1, label: 'will-skip' }));
      q.enqueue(fakeItem({ cost: 1, label: 'will-process' }));

      const result = await q.drain('binance', async (item) => {
        return item.label !== 'will-skip';
      });

      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.pending).toBe(0);
    });

    it('stops draining when budget exceeded mid-cycle', async () => {
      const q = makeQueue({
        dailyBudget: { binance: 5, bybit: 80, okx: 60 },
        drainBatchSize: 10,
      });
      q.enqueue(fakeItem({ cost: 3 }));
      q.enqueue(fakeItem({ cost: 3 }));
      q.enqueue(fakeItem({ cost: 3 }));

      // After first drain: cost=3, remaining=2. isOverBudget → false
      // After second drain: cost=6, remaining=0. isOverBudget → true → break
      const result = await q.drain('binance', async () => true);

      expect(result.processed).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.pending).toBe(1);
    });

    it('handles processor errors gracefully', async () => {
      const q = makeQueue({ drainBatchSize: 5 });
      q.enqueue(fakeItem({ cost: 1 }));
      q.enqueue(fakeItem({ cost: 1 }));

      const result = await q.drain('binance', async () => {
        throw new Error('API timeout');
      });

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.pending).toBe(0);
    });
  });

  describe('remove', () => {
    it('removes item by ID', () => {
      const q = makeQueue();
      const id = q.enqueue(fakeItem({ label: 'removable' }));
      expect(q.getDepth('binance')).toBe(1);

      const removed = q.remove('binance', id!);
      expect(removed).toBe(true);
      expect(q.getDepth('binance')).toBe(0);
    });

    it('returns false for unknown ID', () => {
      const q = makeQueue();
      expect(q.remove('binance', 'nonexistent')).toBe(false);
    });
  });

  describe('peek', () => {
    it('returns items without dequeuing', () => {
      const q = makeQueue();
      q.enqueue(fakeItem({ label: 'a' }));
      q.enqueue(fakeItem({ label: 'b' }));

      const items = q.peek('binance', 2);
      expect(items).toHaveLength(2);
      expect(q.getDepth('binance')).toBe(2); // still in queue
    });
  });

  describe('clear', () => {
    it('removes all items across exchanges', () => {
      const q = makeQueue();
      q.enqueue(fakeItem({ exchange: 'binance' }));
      q.enqueue(fakeItem({ exchange: 'bybit' }));

      q.clear();
      expect(q.getDepth('binance')).toBe(0);
      expect(q.getDepth('bybit')).toBe(0);
    });
  });

  describe('getTotalDepth', () => {
    it('sums across all exchanges', () => {
      const q = makeQueue();
      q.enqueue(fakeItem({ exchange: 'binance' }));
      q.enqueue(fakeItem({ exchange: 'bybit' }));
      q.enqueue(fakeItem({ exchange: 'bybit' }));

      expect(q.getTotalDepth()).toBe(3);
    });
  });
});
