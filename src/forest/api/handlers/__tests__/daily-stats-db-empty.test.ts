import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setupDailyStatsMocks,
  resetDailyStatsMocks,
  mockPrepare,
  mockBind,
  preparedCalls,
} from './daily-stats-test-utils';

setupDailyStatsMocks();

import { dailyStatsHandler } from '../daily-stats';
import { createServerClient } from '@/lib/db/client';

function enableMockDb() {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: mockPrepare,
  } as unknown as ReturnType<typeof createServerClient>);
}

describe('dailyStatsHandler — Database & Empty Queries', () => {
  beforeEach(() => {
    resetDailyStatsMocks();
  });

  describe('database unavailable', () => {
    it('returns error when createServerClient returns null', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database not available');
    });

    it('returns error when createServerClient returns undefined', async () => {
      vi.mocked(createServerClient).mockReturnValue(
        undefined as unknown as ReturnType<typeof createServerClient>
      );
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database not available');
    });
  });

  describe('empty data', () => {
    it('returns zero stats when both tables are empty', async () => {
      enableMockDb();
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.data!.activeBots).toBe(0);
      expect(result.data!.totalTrades).toBe(0);
      expect(result.data!.totalPnl).toBe(0);
      expect(result.data!.winCount).toBe(0);
      expect(result.data!.lossCount).toBe(0);
      expect(result.data!.winRate).toBe(0);
      expect(result.data!.byStrategy).toEqual({});
    });

    it('returns date in YYYY-MM-DD format using local timezone', async () => {
      enableMockDb();
      const result = await dailyStatsHandler();
      const parts = result.data!.date.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(4);
    });
  });

  describe('SQL queries', () => {
    it('issues two prepared statements: one for snapshots, one for trades', async () => {
      enableMockDb();
      await dailyStatsHandler();
      expect(preparedCalls).toHaveLength(2);
      expect(preparedCalls[0]).toContain('capital_snapshots');
      expect(preparedCalls[1]).toContain('trade_events');
    });

    it('filters trade_events by the expected event types', async () => {
      enableMockDb();
      await dailyStatsHandler();
      const tradeSql = preparedCalls[1];
      expect(tradeSql).toContain('TRADE_FILLED');
      expect(tradeSql).toContain('ORDER_FILLED');
      expect(tradeSql).toContain('KILLSWITCH');
      expect(tradeSql).toContain('START');
      expect(tradeSql).toContain('STOP');
    });

    it('uses DISTINCT ON (bot_id) for snapshots', async () => {
      enableMockDb();
      await dailyStatsHandler();
      expect(preparedCalls[0]).toContain('DISTINCT ON (bot_id)');
    });

    it('binds startTimestamp to both queries', async () => {
      enableMockDb();
      await dailyStatsHandler();
      expect(mockBind).toHaveBeenCalledTimes(2);
      for (const call of mockBind.mock.calls) {
        expect(call).toHaveLength(1);
        expect(typeof call[0]).toBe('number');
      }
    });
  });
});
