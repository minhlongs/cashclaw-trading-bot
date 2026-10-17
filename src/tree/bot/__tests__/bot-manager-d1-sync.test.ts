import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupMocks, mockRequest, mockFindBotById } from './bot-manager-test-utils';

setupMocks();

import { BotManager, resetBotManager } from '../bot-manager';

describe('BotManager — D1 Sync & Hydration', () => {
  function createManager(userId?: string) {
    return new BotManager({ userId });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetBotManager();
  });

  describe('getOrCreateBot (lazy single-bot hydration)', () => {
    it('returns existing bot from memory without D1 query', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));

      const result = await mgr.getOrCreateBot('bot-1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('bot-1');
      expect(mockFindBotById).not.toHaveBeenCalled();
    });

    it('hydrates bot from D1 when not in memory', async () => {
      const mgr = createManager();
      const d1Row = {
        id: 'bot-d1',
        user_id: 'user-1',
        name: 'D1 Bot',
        strategy: 'grid',
        pair: 'ETH/USDT',
        exchange: 'binance',
        status: 'paper_test',
        config_json: JSON.stringify({
          strategy: 'grid',
          symbol: 'ETH/USDT',
          exchange: 'binance',
          mode: 'paper',
          capital: 500,
          gridLevels: 3,
          maxDrawdownPct: 15,
        }),
        capital_allocated: 500,
        capital_used: 0,
        total_pnl: 0,
        total_trades: 0,
        win_count: 0,
        loss_count: 0,
        max_drawdown: 0,
        started_at: null,
        stopped_at: null,
        last_error: null,
        last_tick_at: null,
        last_order_at: null,
        current_drawdown: 0,
        created_at: 100,
        updated_at: 100,
      };

      const { createServerClient } = await import('@/lib/db/client');
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(d1Row),
          }),
        }),
      };
      mockFindBotById.mockResolvedValue(d1Row as unknown as null);
      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      const result = await mgr.getOrCreateBot('bot-d1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('bot-d1');
      expect(mockFindBotById).toHaveBeenCalledWith(expect.anything(), 'bot-d1');
    });

    it('returns null when bot not found in D1', async () => {
      const mgr = createManager();
      const { createServerClient } = await import('@/lib/db/client');
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      };
      mockFindBotById.mockResolvedValue(null);
      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      const result = await mgr.getOrCreateBot('missing-bot');
      expect(result).toBeNull();
    });

    it('returns null when DB is unavailable', async () => {
      const mgr = createManager();
      const { createServerClient } = await import('@/lib/db/client');
      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await mgr.getOrCreateBot('bot-1');
      expect(result).toBeNull();
    });

    it('drains queues gracefully', async () => {
      const mgr = createManager();
      await expect(mgr.drainQueues()).resolves.not.toThrow();
    });
  });
});
