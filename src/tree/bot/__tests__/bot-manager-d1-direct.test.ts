import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setupMocks,
  mockRequest,
  makeBotRow,
  mockFindBotById,
  mockFindAllBots,
  mockFindBotsByUser,
} from './bot-manager-test-utils';

setupMocks();

import { BotManager, resetBotManager } from '../bot-manager';
import { createServerClient } from '@/lib/db/client';

describe('BotManager — D1 Direct-Read & Anti-IDOR Authorization', () => {
  function createManager(userId?: string, deps?: Record<string, unknown>) {
    return new BotManager({ userId, ...deps });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetBotManager();
    vi.mocked(createServerClient).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as ReturnType<typeof createServerClient>);
  });

  describe('D1 direct-read fallback and cache TTL', () => {
    it('cache TTL: getBot returns cached instance within TTL without re-hydrating', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('cached-bot'));

      const bot1 = mgr.getBot('cached-bot');
      expect(bot1).toBeDefined();

      const bot2 = mgr.getBot('cached-bot');
      expect(bot2).toBe(bot1);
    });

    it('falls back to in-memory cache when D1 read throws', async () => {
      mockFindBotsByUser.mockRejectedValueOnce(new Error('D1 unavailable'));
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('cached-only'));

      const bots = await mgr.getAllBots();
      expect(bots).toHaveLength(1);
      expect(bots[0].id).toBe('cached-only');
    });

    it('getAllBots and getRunningBots fall back to cache when DB client is null', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);

      const mgr = createManager();
      await mgr.createBot(mockRequest('db-null-bot'));
      const allBots = await mgr.getAllBots();
      expect(allBots).toHaveLength(1);
      expect(allBots[0].id).toBe('db-null-bot');

      const runningBots = await mgr.getRunningBots();
      expect(runningBots).toBeDefined();
    });

    it('getRunningBots falls back to cache when D1 throws', async () => {
      mockFindAllBots.mockRejectedValueOnce(new Error('D1 error'));
      const mgr = createManager();
      await mgr.createBot(mockRequest('running-err-bot'));
      const running = await mgr.getRunningBots();
      expect(running).toBeDefined();
    });
  });

  describe('Anti-IDOR Authorization Scoping', () => {
    it('getOrCreateBot rejects cross-user bot (IDOR protection)', async () => {
      const mgr = createManager('user-1');
      const d1Row = makeBotRow({
        id: 'victim-bot',
        user_id: 'user-victim',
        name: 'Victim Bot',
      });
      mockFindBotById.mockResolvedValue(d1Row);

      const res = await mgr.getOrCreateBot('victim-bot');
      expect(res).toBeNull();
    });

    it('getBot rejects cross-user access from cached instance', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('owned-bot'));

      expect(mgr.getBot('owned-bot')).toBeDefined();
      expect(mgr.getBot('owned-bot', 'user-2')).toBeUndefined();
    });

    it('lifecycle methods reject cross-user access', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('lifecycle-bot'));

      await expect(mgr.startBot('lifecycle-bot', 'user-2')).rejects.toThrow(
        'Unauthorized access'
      );
      expect(() => mgr.pauseBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');
      expect(() => mgr.resumeBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');
      expect(() => mgr.stopBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');
      expect(() => mgr.removeBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');

      expect(mgr.getBot('lifecycle-bot')).toBeDefined();
    });

    it('getOrCreateBot catches error and invokes onError if createBot fails', async () => {
      const onError = vi.fn();
      const mgr = createManager('user-1', { onError });
      const d1Row = makeBotRow({
        id: 'fail-bot',
        user_id: 'user-1',
        name: 'Fail Bot',
        config_json: JSON.stringify({ strategy: 'grid', symbol: 'BTC/USDT' }),
      });
      mockFindBotById.mockResolvedValue(d1Row);

      vi.spyOn((mgr as unknown as { factory: { createBot: () => Promise<unknown> } }).factory, 'createBot').mockRejectedValueOnce(
        new Error('Creation exploded')
      );
      const res = await mgr.getOrCreateBot('fail-bot');
      expect(res).toBeNull();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Creation exploded' }),
        'bot-manager:getOrCreateBot:fail-bot'
      );
    });
  });
});
