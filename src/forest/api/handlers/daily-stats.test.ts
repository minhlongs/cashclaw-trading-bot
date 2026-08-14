import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockSnapAll = vi.fn();
const mockTradeAll = vi.fn();
let preparedCalls: string[] = [];

const mockBind = vi.fn().mockImplementation(function (this: any, ..._args: unknown[]) {
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

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { dailyStatsHandler } from './daily-stats';
import { createServerClient } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enableMockDb() {
  vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
}

function snapRow(overrides: Record<string, unknown> = {}) {
  return {
    bot_id: 'bot-1',
    total_capital: 1000,
    realized_pnl: 50,
    max_drawdown_pct: 3.5,
    ...overrides,
  };
}

function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    bot_id: 'bot-1',
    event_type: 'TRADE_FILLED',
    detail_json: '{"pnl":10,"strategy":"grid"}',
    created_at: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dailyStatsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preparedCalls = [];

    // Re-apply implementations after clearAllMocks wipes them
    mockPrepare.mockImplementation(function (this: any, sql: string) {
      preparedCalls.push(sql);
      const isSnap = sql.includes('capital_snapshots');
      return {
        _isSnap: isSnap,
        bind: mockBind.bind({ _isSnap: isSnap }),
      };
    });

    mockBind.mockImplementation(function (this: any, ..._args: unknown[]) {
      return {
        all: this._isSnap ? mockSnapAll : mockTradeAll,
      };
    });

    mockSnapAll.mockResolvedValue({ results: [] });
    mockTradeAll.mockResolvedValue({ results: [] });
  });

  // =========================================================================
  // 1. Database unavailable
  // =========================================================================

  describe('database unavailable', () => {
    it('returns error when createServerClient returns null', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database not available');
    });

    it('returns error when createServerClient returns undefined', async () => {
      vi.mocked(createServerClient).mockReturnValue(undefined as any);
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database not available');
    });
  });

  // =========================================================================
  // 2. Successful queries with empty data
  // =========================================================================

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
      expect(parts[1]).toHaveLength(2);
      expect(parts[2]).toHaveLength(2);
    });
  });

  // =========================================================================
  // 3. Snapshots contribute to activeBots and totalPnl
  // =========================================================================

  describe('snapshots aggregation', () => {
    it('counts unique bot_ids as activeBots', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [
          snapRow({ bot_id: 'bot-1' }),
          snapRow({ bot_id: 'bot-2' }),
          snapRow({ bot_id: 'bot-1' }), // duplicate bot_id, not a new bot
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

  // =========================================================================
  // 4. Trade events counting and PnL
  // =========================================================================

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
      expect(result.data!.winCount).toBe(2); // pnl >= 0 counts as win
      expect(result.data!.lossCount).toBe(1);
      expect(result.data!.winRate).toBe(67); // Math.round(2/3 * 100)
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
      expect(result.data!.totalPnl).toBe(115); // 100 (snapshot) + 25 + (-10)
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
        results: [
          tradeRow({ detail_json: '{"pnl":0,"strategy":"grid"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.winCount).toBe(1);
      expect(result.data!.lossCount).toBe(0);
      expect(result.data!.winRate).toBe(100);
    });

    it('treats negative pnl as a loss', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ detail_json: '{"pnl":-0.01,"strategy":"grid"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.winCount).toBe(0);
      expect(result.data!.lossCount).toBe(1);
      expect(result.data!.winRate).toBe(0);
    });

    it('rounds winRate correctly (round half up)', async () => {
      enableMockDb();
      // 1/3 = 33.33... → rounds to 33
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":10,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":-5,"strategy":"b"}' }),
          tradeRow({ id: '3', detail_json: '{"pnl":-1,"strategy":"c"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.winRate).toBe(33); // Math.round(1/3 * 100)
    });

    it('returns winRate 100 when all trades are wins', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":5,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":10,"strategy":"b"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.winRate).toBe(100);
    });

    it('returns winRate 0 when all trades are losses', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":-5,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":-10,"strategy":"b"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.winRate).toBe(0);
    });
  });

  // =========================================================================
  // 5. Strategy grouping (byStrategy)
  // =========================================================================

  describe('byStrategy grouping', () => {
    it('groups trades by strategy name', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', bot_id: 'a', detail_json: '{"pnl":10,"strategy":"grid"}', created_at: 1000 }),
          tradeRow({ id: '2', bot_id: 'b', detail_json: '{"pnl":5,"strategy":"grid"}', created_at: 2000 }),
          tradeRow({ id: '3', bot_id: 'c', event_type: 'ORDER_FILLED', detail_json: '{"pnl":-3,"strategy":"mean_reversion"}', created_at: 3000 }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.byStrategy).toEqual({
        grid: { trades: 2, pnl: 15 },
        mean_reversion: { trades: 1, pnl: -3 },
      });
    });

    it('defaults strategy to "unknown" when field is missing', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ detail_json: '{"pnl":10}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.byStrategy).toEqual({
        unknown: { trades: 1, pnl: 10 },
      });
    });

    it('defaults pnl to 0 when field is missing in detail_json', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ detail_json: '{"strategy":"grid"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.byStrategy).toEqual({
        grid: { trades: 1, pnl: 0 },
      });
      expect(result.data!.winCount).toBe(1); // pnl=0 >= 0 → win
      expect(result.data!.lossCount).toBe(0);
    });

    it('accumulates trade counts and pnl per strategy', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":100,"strategy":"scalp"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":-50,"strategy":"scalp"}' }),
          tradeRow({ id: '3', detail_json: '{"pnl":200,"strategy":"dca"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.byStrategy).toEqual({
        scalp: { trades: 2, pnl: 50 },
        dca: { trades: 1, pnl: 200 },
      });
    });
  });

  // =========================================================================
  // 6. Malformed / null detail_json
  // =========================================================================

  describe('malformed detail_json', () => {
    it('skips malformed JSON without crashing', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: 'BAD_JSON' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(1);
      expect(result.data!.winCount).toBe(1); // skipped JSON: defaults to pnl=0, which is >= 0
      expect(result.data!.lossCount).toBe(0);
    });

    it('handles null detail_json gracefully', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: null }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(1);
      // null ?? '{}' → '{}' → pnl defaults to 0 → win
      expect(result.data!.winCount).toBe(1);
    });

    it('handles empty string detail_json gracefully', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.ok).toBe(true);
      expect(result.data!.totalTrades).toBe(1);
      // '' ?? '{}' → '' → JSON.parse('') throws → skipped
      expect(result.data!.winCount).toBe(1); // no pnl counted → winRate 0 / 1 = 100
    });

    it('continues processing other rows after a malformed one', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: 'BAD' }),
          tradeRow({ id: '2', detail_json: '{"pnl":42,"strategy":"good"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.totalTrades).toBe(2);
      expect(result.data!.byStrategy).toEqual({
        unknown: { trades: 1, pnl: 0 },
        good: { trades: 1, pnl: 42 },
      });
    });

    it('skips malformed JSON and does not add it to byStrategy', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{broken' }),
          tradeRow({ id: '2', detail_json: '{"pnl":5,"strategy":"grid"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      // malformed row uses 'unknown' strategy; valid row uses 'grid'
      expect(Object.keys(result.data!.byStrategy).sort()).toEqual(['grid', 'unknown']);
      expect(result.data!.byStrategy.unknown).toEqual({ trades: 1, pnl: 0 });
    });
  });

  // =========================================================================
  // 7. Query errors
  // =========================================================================

  describe('query errors', () => {
    it('returns error when snapshot query throws', async () => {
      enableMockDb();
      mockSnapAll.mockRejectedValue(new Error('D1 query failed'));
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to compute daily stats');
    });

    it('returns error when trade events query throws', async () => {
      enableMockDb();
      mockTradeAll.mockRejectedValue(new Error('D1 connection lost'));
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to compute daily stats');
    });

    it('returns error when prepare itself throws', async () => {
      enableMockDb();
      mockPrepare.mockImplementation(() => { throw new Error('prepare failed'); });
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to compute daily stats');
    });

    it('returns error when bind throws', async () => {
      enableMockDb();
      mockBind.mockImplementation(() => { throw new Error('bind failed'); });
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to compute daily stats');
    });

    it('handles non-Error thrown values in snapshot query', async () => {
      enableMockDb();
      mockSnapAll.mockRejectedValue('string error');
      const result = await dailyStatsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to compute daily stats');
    });
  });

  // =========================================================================
  // 8. SQL correctness
  // =========================================================================

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
      // Each bind call should receive exactly one argument (the timestamp)
      for (const call of mockBind.mock.calls) {
        expect(call).toHaveLength(1);
        expect(typeof call[0]).toBe('number');
      }
    });
  });

  // =========================================================================
  // 9. Complex mixed scenarios
  // =========================================================================

  describe('complex scenarios', () => {
    it('correctly combines multiple bots, snapshots, and mixed events', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [
          snapRow({ bot_id: 'alpha', realized_pnl: 200 }),
          snapRow({ bot_id: 'beta', realized_pnl: -50 }),
          snapRow({ bot_id: 'alpha', realized_pnl: 100 }), // duplicate bot_id
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
      expect(result.data!.activeBots).toBe(2); // alpha, beta from snapshots (gamma only in events)
      expect(result.data!.totalTrades).toBe(4);
      expect(result.data!.winCount).toBe(3); // 30, 0, 5 (>= 0)
      expect(result.data!.lossCount).toBe(1); // -15
      expect(result.data!.winRate).toBe(75); // 3/4
      expect(result.data!.totalPnl).toBe(270); // 200 + (-50) + 30 + (-15) + 0 + 5
      expect(result.data!.byStrategy).toEqual({
        grid: { trades: 2, pnl: 30 },    // 30 + 0
        dca: { trades: 1, pnl: -15 },
        scalp: { trades: 1, pnl: 5 },
      });
    });

    it('handles very large negative PnL values', async () => {
      enableMockDb();
      mockSnapAll.mockResolvedValue({
        results: [snapRow({ realized_pnl: -10000 })],
      });
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ detail_json: '{"pnl":-5000,"strategy":"grid"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.totalPnl).toBe(-15000);
      expect(result.data!.winCount).toBe(0);
      expect(result.data!.lossCount).toBe(1);
    });

    it('handles floating-point pnl values correctly', async () => {
      enableMockDb();
      mockTradeAll.mockResolvedValue({
        results: [
          tradeRow({ id: '1', detail_json: '{"pnl":0.1,"strategy":"a"}' }),
          tradeRow({ id: '2', detail_json: '{"pnl":0.2,"strategy":"a"}' }),
        ],
      });

      const result = await dailyStatsHandler();
      expect(result.data!.totalPnl).toBeCloseTo(0.3, 10);
      expect(result.data!.winCount).toBe(2);
    });
  });
});
