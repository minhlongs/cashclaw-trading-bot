import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSnapAll = vi.fn();
const mockTradeAll = vi.fn();
let preparedCalls: string[] = [];

const mockBind = vi.fn().mockImplementation(function (this: any, ...args: unknown[]) {
  return {
    all: this._isSnap ? mockSnapAll : mockTradeAll,
  };
});
const mockPrepare = vi.fn().mockImplementation(function (this: any, sql: string) {
  preparedCalls.push(sql);
  const isSnap = sql.includes('capital_snapshots');
  return {
    _isSnap: isSnap,
    bind: mockBind.bind({ _isSnap: isSnap }),
  };
});

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

import { dailyStatsHandler } from './daily-stats';
import { createServerClient } from '@/lib/db/client';

describe('dailyStatsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preparedCalls = [];
    mockSnapAll.mockResolvedValue({ results: [] });
    mockTradeAll.mockResolvedValue({ results: [] });
  });

  describe('database unavailable', () => {
    it('returns error when createServerClient returns null', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database not available');
    });
  });

  describe('empty data', () => {
    it('returns zero stats when no snapshots or events exist', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.activeBots).toBe(0);
      expect(result.data!.totalTrades).toBe(0);
      expect(result.data!.totalPnl).toBe(0);
      expect(result.data!.winCount).toBe(0);
      expect(result.data!.lossCount).toBe(0);
      expect(result.data!.winRate).toBe(0);
      expect(result.data!.byStrategy).toEqual({});
    });
  });

  describe('snapshots', () => {
    it('counts active bots from snapshots', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockSnapAll.mockResolvedValue({
        results: [
          { bot_id: 'a', total_capital: 1000, realized_pnl: 50, max_drawdown_pct: 2 },
          { bot_id: 'b', total_capital: 2000, realized_pnl: -10, max_drawdown_pct: 5 },
        ],
      });
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.activeBots).toBe(2);
      expect(result.data!.totalPnl).toBe(40); // 50 + (-10)
    });
  });

  describe('trade events', () => {
    it('counts wins and losses from pnl in detail_json', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockTradeAll.mockResolvedValue({
        results: [
          { id: '1', bot_id: 'a', event_type: 'TRADE_FILLED', detail_json: '{"pnl":25,"strategy":"grid"}', created_at: 1000 },
          { id: '2', bot_id: 'a', event_type: 'TRADE_FILLED', detail_json: '{"pnl":-10,"strategy":"grid"}', created_at: 2000 },
          { id: '3', bot_id: 'b', event_type: 'ORDER_FILLED', detail_json: '{"pnl":0,"strategy":"mean_reversion"}', created_at: 3000 },
        ],
      });
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(3);
      expect(result.data!.winCount).toBe(2); // pnl >= 0
      expect(result.data!.lossCount).toBe(1);
      expect(result.data!.winRate).toBe(67); // round(2/3 * 100)
      expect(result.data!.totalPnl).toBe(15); // snapshot 0 + event 25 + event -10 + event 0
    });

    it('handles malformed detail_json gracefully', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockTradeAll.mockResolvedValue({
        results: [
          { id: '1', bot_id: 'a', event_type: 'TRADE_FILLED', detail_json: 'BAD_JSON', created_at: 1000 },
        ],
      });
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(1);
      expect(result.data!.winCount).toBe(1); // pnl defaults to 0 which is >= 0
    });

    it('groups trades by strategy', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockTradeAll.mockResolvedValue({
        results: [
          { id: '1', bot_id: 'a', event_type: 'TRADE_FILLED', detail_json: '{"pnl":10,"strategy":"grid"}', created_at: 1000 },
          { id: '2', bot_id: 'b', event_type: 'TRADE_FILLED', detail_json: '{"pnl":5,"strategy":"grid"}', created_at: 2000 },
          { id: '3', bot_id: 'c', event_type: 'ORDER_FILLED', detail_json: '{"pnl":-3,"strategy":"mean_reversion"}', created_at: 3000 },
        ],
      });
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.byStrategy).toEqual({
        grid: { trades: 2, pnl: 15 },
        mean_reversion: { trades: 1, pnl: -3 },
      });
    });
  });

  describe('query errors', () => {
    it('returns error when query throws', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockSnapAll.mockRejectedValue(new Error('D1 query failed'));
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to compute daily stats');
    });
  });
});
