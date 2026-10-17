import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setupDailyStatsMocks,
  resetDailyStatsMocks,
  mockPrepare,
  mockSnapAll,
  mockTradeAll,
  snapRow,
  tradeRow,
} from './daily-stats-test-utils';

setupDailyStatsMocks();

import { dailyStatsHandler } from '../daily-stats';
import { createServerClient } from '@/lib/db/client';

function enableMockDb() {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: mockPrepare,
  } as unknown as ReturnType<typeof createServerClient>);
}

describe('dailyStatsHandler — Aggregations', () => {
  beforeEach(() => {
    resetDailyStatsMocks();
  });

  describe('snapshots aggregation', () => {
    it('counts unique bot_ids as activeBots', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [
          snapRow({ bot_id: 'bot-1' }),
          snapRow({ bot_id: 'bot-2' }),
          snapRow({ bot_id: 'bot-1' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.activeBots).toBe(2);
    });

    it('sums realized_pnl from all snapshot rows', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [
          snapRow({ bot_id: 'bot-1', realized_pnl: 100 }),
          snapRow({ bot_id: 'bot-2', realized_pnl: -30 }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalPnl).toBe(70);
    });

    it('handles snapshot with zero realized_pnl', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [snapRow({ realized_pnl: 0 })],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.totalPnl).toBe(0);
    });
  });

  describe('trade events', () => {
    it('counts wins and losses from pnl in detail_json', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', bot_id: 'a', detail_json: '{"pnl":25,"strategy":"grid"}', created_at: 1000 }),
          tradeRow({ id: '2', bot_id: 'a', detail_json: '{"pnl":-10,"strategy":"grid"}', created_at: 2000 }),
          tradeRow({ id: '3', bot_id: 'b', event_type: 'ORDER_FILLED', detail_json: '{"pnl":0,"strategy":"mean_reversion"}', created_at: 3000 }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(3);
      expect(result.data!.winCount).toBe(2);
      expect(result.data!.lossCount).toBe(1);
      expect(result.data!.winRate).toBe(67);
    });

    it('adds event pnl to totalPnl alongside snapshots', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [snapRow({ bot_id: 'a', realized_pnl: 100 })],
      });
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ detail_json: '{"pnl":25,"strategy":"grid"}' }),
          tradeRow({ detail_json: '{"pnl":-10,"strategy":"grid"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalPnl).toBe(115);
    });

    it('returns winRate 0 when there are no trades', async () => {
      enableMockDb();
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(0);
      expect(result.data!.winRate).toBe(0);
    });

    it('treats pnl of exactly 0 as a win', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [tradeRow({ detail_json: '{"pnl":0,"strategy":"grid"}' })],
      });
      const result = await dailyStatsHandler();
      expect(result.data!.winCount).toBe(1);
      expect(result.data!.lossCount).toBe(0);
      expect(result.data!.winRate).toBe(100);
    });

    it('treats negative pnl as a loss', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [tradeRow({ detail_json: '{"pnl":-0.01,"strategy":"grid"}' })],
      });
      const result = await dailyStatsHandler();
      expect(result.data!.winCount).toBe(0);
      expect(result.data!.lossCount).toBe(1);
      expect(result.data!.winRate).toBe(0);
    });

    it('rounds winRate correctly (round half up)', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":10,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":-5,"strategy":"b"}' }),
          tradeRow({ id: '3', detail_json: '{"pnl":-1,"strategy":"c"}' }),
        ],
      });
      const result = await dailyStatsHandler();
      expect(result.data!.winRate).toBe(33);
    });

    it('returns winRate 100 when all trades are wins and 0 when all losses', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValueOnce({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":5,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":10,"strategy":"b"}' }),
        ],
      });
      const res1 = await dailyStatsHandler();
      expect(res1.data!.winRate).toBe(100);

      mockTradeAll.mockResolvedValueOnce({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":-5,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":-10,"strategy":"b"}' }),
        ],
      });
      const res2 = await dailyStatsHandler();
      expect(res2.data!.winRate).toBe(0);
    });
  });
});
