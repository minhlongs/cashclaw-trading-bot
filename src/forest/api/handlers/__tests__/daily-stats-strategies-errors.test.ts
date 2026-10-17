import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setupDailyStatsMocks,
  resetDailyStatsMocks,
  mockPrepare,
  mockBind,
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

describe('dailyStatsHandler — Strategies, Errors & Scenarios', () => {
  beforeEach(() => {
    resetDailyStatsMocks();
  });

  describe('byStrategy grouping', () => {
    it('groups trades by strategy name and handles missing fields', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":10,"strategy":"grid"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":-3,"strategy":"grid"}' }),
          tradeRow({ id: '3', detail_json: '{"pnl":15}' }),
          tradeRow({ id: '4', detail_json: '{"strategy":"dca"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.byStrategy).toEqual({
        grid: { trades: 2, pnl: 7 },
        unknown: { trades: 1, pnl: 15 },
        dca: { trades: 1, pnl: 0 },
      });
    });
  });

  describe('malformed detail_json', () => {
    it('handles bad json, null, and empty string detail_json gracefully', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: 'BAD_JSON' }),
          tradeRow({ id: '2', detail_json: null }),
          tradeRow({ id: '3', detail_json: '' }),
          tradeRow({ id: '4', detail_json: '{"pnl":42,"strategy":"good"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(4);
      expect(result.data!.byStrategy).toEqual({
        unknown: { trades: 3, pnl: 0 },
        good: { trades: 1, pnl: 42 },
      });
    });
  });

  describe('query errors', () => {
    it('returns error when snapshot or trade query throws', async () => {
      enableMockDb();
      mockSnapAll.mockRejectedValueOnce(new Error('D1 query failed'));
      const res1 = await dailyStatsHandler();
      expect(res1.ok).toBe(false);
      expect(res1.error).toBe('Failed to compute daily stats');

      mockSnapAll.mockResolvedValueOnce({ results: [] });
      mockTradeAll.mockRejectedValueOnce(new Error('D1 connection lost'));
      const res2 = await dailyStatsHandler();
      expect(res2.ok).toBe(false);
      expect(res2.error).toBe('Failed to compute daily stats');
    });

    it('returns error when prepare or bind throws', async () => {
      enableMockDb();
      mockPrepare.mockImplementationOnce(() => { throw new Error('prepare failed'); });
      const res1 = await dailyStatsHandler();
      expect(res1.ok).toBe(false);
      expect(res1.error).toBe('Failed to compute daily stats');

      mockBind.mockImplementationOnce(() => { throw new Error('bind failed'); });
      const res2 = await dailyStatsHandler();
      expect(res2.ok).toBe(false);
      expect(res2.error).toBe('Failed to compute daily stats');
    });

    it('handles non-Error thrown values in snapshot query', async () => {
      enableMockDb();
      mockSnapAll.mockRejectedValue('string error');
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to compute daily stats');
    });
  });

  describe('complex scenarios', () => {
    it('correctly combines multiple bots, snapshots, and mixed events', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [
          snapRow({ bot_id: 'alpha', realized_pnl: 200 }),
          snapRow({ bot_id: 'beta', realized_pnl: -50 }),
          snapRow({ bot_id: 'alpha', realized_pnl: 100 }),
        ],
      });
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', bot_id: 'alpha', detail_json: '{"pnl":30,"strategy":"grid"}', created_at: 1000 }),
          tradeRow({ id: '2', bot_id: 'beta', detail_json: '{"pnl":-15,"strategy":"dca"}', created_at: 2000 }),
          tradeRow({ id: '3', bot_id: 'alpha', event_type: 'ORDER_FILLED', detail_json: '{"pnl":0,"strategy":"grid"}', created_at: 3000 }),
          tradeRow({ id: '4', bot_id: 'gamma', event_type: 'STOP', detail_json: '{"pnl":5,"strategy":"scalp"}', created_at: 4000 }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.activeBots).toBe(2);
      expect(result.data!.totalTrades).toBe(4);
      expect(result.data!.winCount).toBe(3);
      expect(result.data!.lossCount).toBe(1);
      expect(result.data!.winRate).toBe(75);
      expect(result.data!.totalPnl).toBe(270);
      expect(result.data!.byStrategy).toEqual({
        grid: { trades: 2, pnl: 30 },
        dca: { trades: 1, pnl: -15 },
        scalp: { trades: 1, pnl: 5 },
      });
    });

    it('handles large negative and floating-point values', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [snapRow({ realized_pnl: -10000 })],
      });
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ detail_json: '{"pnl":-5000,"strategy":"grid"}' }),
        ],
      });

      const res1 = await dailyStatsHandler();
      expect(res1.data!.totalPnl).toBe(-15000);

      mockSnapAll.mockResolvedValue({ results: [] });
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":0.1,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":0.2,"strategy":"a"}' }),
        ],
      });
      const res2 = await dailyStatsHandler();
      expect(res2.data!.totalPnl).toBeCloseTo(0.3, 10);
      expect(res2.data!.winCount).toBe(2);
    });
  });
});
