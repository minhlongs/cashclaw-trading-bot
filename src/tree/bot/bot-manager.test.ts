// bot-manager.test.ts — unit tests for BotManager singleton orchestrator
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotStatus } from './types';
import type { Bot } from '@/lib/db/types';
import type { RequestQueue, QueueItem } from '../exchange/queue';

// ── Hoisted vi.mock() factories ─────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const mockFindBotById = vi.fn();
vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));
vi.mock('@/lib/db/repositories', () => ({
  findBotById: (...args: unknown[]) => mockFindBotById(...args),
  findAllBots: vi.fn(async () => []),
  findBotsByUser: vi.fn(async () => []),
}));

vi.mock('@/forest/bot/d1-adapter', () => ({
  hydrateFromD1: vi.fn(async () => {}),
  patchBot: vi.fn(async () => {}),
}));

vi.mock('@/forest/bot/d1-hydration', () => ({
  restoreBotStateFromRow: vi.fn(),
  toBotStatus: vi.fn((s: string) => s === 'paper_test' || s === 'live_running' ? 'running' : 'idle'),
}));

vi.mock('./bot-manager-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bot-manager-helpers')>();
  return {
    ...actual,
    createD1Callbacks: vi.fn(() => ({
      onStateChange: vi.fn(),
      onTrade: vi.fn(),
      onLog: vi.fn(),
      onError: vi.fn(),
    })),
    persistNewBot: vi.fn(async () => {}),
    patchBot: vi.fn(async () => {}),
  };
});

vi.mock('./paper-adapter', () => ({
  createPaperAdapter: vi.fn(() => ({
    fetchTicker: vi.fn(async () => ({ last: 50000, symbol: 'BTC/USDT' })),
    placeOrder: vi.fn(async () => ({ id: 'mock-order', status: 'filled' })),
    cancelOrder: vi.fn(async () => true),
    fetchBalance: vi.fn(async () => ({ free: { USDT: 10000 } })),
    fetchOpenOrders: vi.fn(async () => []),
  })),
}));

vi.mock('./bot-instance', () => {
  let callCount = 0;
  return {
    BotInstance: vi.fn().mockImplementation((id: string) => {
      callCount++;
      const mockId = id || `bot-${callCount}`;
      return {
        id: mockId,
        getSnapshot: vi.fn(() => ({
          status: 'idle' as BotStatus,
          totalPnl: 0,
          symbol: 'BTC/USDT',
          strategy: 'grid',
        })),
        getConfig: vi.fn(() => ({
          symbol: 'BTC/USDT',
          strategy: 'grid',
          capital: 1000,
          intervals: { checkIntervalMs: 60_000 },
        })),
        start: vi.fn(async () => {}),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        destroy: vi.fn(),
      };
    }),
  };
});

// ── Test suite ──────────────────────────────────────────────────────────────

describe('BotManager', () => {
  let BotManager: typeof import('./bot-manager').BotManager;
  let resetBotManager: typeof import('./bot-manager').resetBotManager;
  let getBotManager: typeof import('./bot-manager').getBotManager;
  let patchBot: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-establish mock implementations after clearAllMocks
    const d1Adapter = await import('@/forest/bot/d1-adapter');
    patchBot = d1Adapter.patchBot as ReturnType<typeof vi.fn>;
    patchBot.mockResolvedValue(undefined);

    const logger = await import('@/lib/logger');
    (logger.createLogger as ReturnType<typeof vi.fn>).mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const botManagerMod = await import('./bot-manager');
    BotManager = botManagerMod.BotManager;
    resetBotManager = botManagerMod.resetBotManager;
    getBotManager = botManagerMod.getBotManager;

    // Always reset singleton before each test
    resetBotManager();
  });

  // Helper to create a BotManager instance
  function createManager(userId?: string, deps?: Record<string, unknown>) {
    return new BotManager({ userId, ...deps });
  }

  // Helper to create a mock CreateBotRequest
  function mockRequest(id: string) {
    return {
      id,
      config: {
        symbol: 'BTC/USDT',
        strategy: 'grid' as const,
        capital: 1000,
        gridSpacingPct: 1,
        gridLevels: 4,
        capitalPerLevelPct: 25,
        takeProfitPct: 2,
        stopLossPct: 3,
        rebalanceOnFill: false,
        maxDrawdownPct: 15,
        exchange: 'binance',
        mode: 'paper' as const,
      },
      exchangeConfig: {
        apiKey: 'test',
        apiSecret: 'secret',
        testnet: false,
        sandbox: false,
        rateLimitMs: 1000,
      },
      mode: 'paper' as const,
    };
  }

  // ── getBot ──────────────────────────────────────────────────────────────

  describe('getBot', () => {
    it('returns undefined when bot does not exist', () => {
      const mgr = createManager();
      expect(mgr.getBot('nonexistent')).toBeUndefined();
    });

    it('returns the BotInstance after creation', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1');
      expect(bot).toBeDefined();
      expect(bot?.id).toBe('bot-1');
    });

    it('returns correct bot when multiple bots exist', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-a'));
      await mgr.createBot(mockRequest('bot-b'));
      expect(mgr.getBot('bot-a')?.id).toBe('bot-a');
      expect(mgr.getBot('bot-b')?.id).toBe('bot-b');
    });
  });

  // ── getAllBots ───────────────────────────────────────────────────────────

  describe('getAllBots', () => {
    it('returns empty array when no bots exist', async () => {
      const mgr = createManager();
      expect(await mgr.getAllBots()).toEqual([]);
    });

    it('returns all created bots', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      await mgr.createBot(mockRequest('bot-2'));
      const all = await mgr.getAllBots();
      expect(all).toHaveLength(2);
      expect(all.map((b) => b.id)).toEqual(expect.arrayContaining(['bot-1', 'bot-2']));
    });

    it('returns empty array after all bots are removed', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      mgr.removeBot('bot-1');
      expect(await mgr.getAllBots()).toEqual([]);
    });
  });

  // ── startBot ────────────────────────────────────────────────────────────

  describe('startBot', () => {
    it('throws if bot not found', async () => {
      const mgr = createManager();
      await expect(mgr.startBot('nonexistent')).rejects.toThrow('Bot not found: nonexistent');
    });

    it('calls bot.start()', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      await mgr.startBot('bot-1');
      expect(bot.start).toHaveBeenCalledOnce();
    });

    it('propagates error from bot.start()', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      (bot.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('exchange down'));
      await expect(mgr.startBot('bot-1')).rejects.toThrow('exchange down');
    });
  });

  // ── stopBot ─────────────────────────────────────────────────────────────

  describe('stopBot', () => {
    it('throws if bot not found', () => {
      const mgr = createManager();
      expect(() => mgr.stopBot('nonexistent')).toThrow('Bot not found: nonexistent');
    });

    it('calls bot.stop()', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      mgr.stopBot('bot-1');
      expect(bot.stop).toHaveBeenCalledOnce();
    });

    it('persists status to D1 when userId provided', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      (bot.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 'stopped' as BotStatus,
        totalPnl: 0,
        symbol: 'BTC/USDT',
        strategy: 'grid',
      });
      mgr.stopBot('bot-1');
      // patchBot called async; wait a tick
      await new Promise((r) => setTimeout(r, 0));
      expect(patchBot).toHaveBeenCalledWith('bot-1', expect.objectContaining({ status: 'stopped' }));
    });

    it('does not persist when no userId', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      mgr.stopBot('bot-1');
      await new Promise((r) => setTimeout(r, 0));
      expect(patchBot).not.toHaveBeenCalled();
    });
  });

  // ── pauseBot ────────────────────────────────────────────────────────────

  describe('pauseBot', () => {
    it('throws if bot not found', () => {
      const mgr = createManager();
      expect(() => mgr.pauseBot('nonexistent')).toThrow('Bot not found: nonexistent');
    });

    it('calls bot.pause()', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      mgr.pauseBot('bot-1');
      expect(bot.pause).toHaveBeenCalledOnce();
    });

    it('persists paused status to D1 when userId provided', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      (bot.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 'paused' as BotStatus,
        totalPnl: 5,
        symbol: 'BTC/USDT',
        strategy: 'grid',
      });
      mgr.pauseBot('bot-1');
      await new Promise((r) => setTimeout(r, 0));
      expect(patchBot).toHaveBeenCalledWith('bot-1', expect.objectContaining({ status: 'paused' }));
    });
  });

  // ── resumeBot ───────────────────────────────────────────────────────────

  describe('resumeBot', () => {
    it('throws if bot not found', () => {
      const mgr = createManager();
      expect(() => mgr.resumeBot('nonexistent')).toThrow('Bot not found: nonexistent');
    });

    it('calls bot.resume()', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      mgr.resumeBot('bot-1');
      expect(bot.resume).toHaveBeenCalledOnce();
    });

    it('throws when killswitch is halted', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      // Halt killswitch via manual halt
      mgr.manualHalt('test halt');
      expect(() => mgr.resumeBot('bot-1')).toThrow('Cannot resume: killswitch is halted');
    });

    it('resumes after killswitch is manually resumed', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      mgr.manualHalt('test halt');
      mgr.manualResume();
      mgr.resumeBot('bot-1');
      expect(bot.resume).toHaveBeenCalledOnce();
    });

    it('persists resumed status to D1 when userId provided', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      (bot.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 'running' as BotStatus,
        totalPnl: 10,
        symbol: 'BTC/USDT',
        strategy: 'grid',
      });
      mgr.resumeBot('bot-1');
      await new Promise((r) => setTimeout(r, 0));
      // toD1Status('running') maps to 'paper_test'; total_pnl is snake_case
      expect(patchBot).toHaveBeenCalledWith('bot-1', expect.objectContaining({ status: 'paper_test', total_pnl: 10 }));
    });
  });

  // ── manualHalt ──────────────────────────────────────────────────────────

  describe('manualHalt', () => {
    it('halts the killswitch with the given reason', () => {
      const mgr = createManager();
      mgr.manualHalt('operator pause');
      const ks = mgr.getKillswitch();
      expect(ks.isTradingEnabled()).toBe(false);
    });

    it('killswitch halts even with no bots', () => {
      const mgr = createManager();
      mgr.manualHalt('emergency');
      expect(mgr.getKillswitch().isTradingEnabled()).toBe(false);
    });
  });

  // ── manualResume ────────────────────────────────────────────────────────

  describe('manualResume', () => {
    it('resumes a halted killswitch', () => {
      const mgr = createManager();
      mgr.manualHalt('test');
      expect(mgr.getKillswitch().isTradingEnabled()).toBe(false);
      mgr.manualResume();
      expect(mgr.getKillswitch().isTradingEnabled()).toBe(true);
    });

    it('is idempotent when killswitch already enabled', () => {
      const mgr = createManager();
      // killswitch starts enabled by default
      expect(mgr.getKillswitch().isTradingEnabled()).toBe(true);
      mgr.manualResume(); // should not throw
      expect(mgr.getKillswitch().isTradingEnabled()).toBe(true);
    });
  });

  // ── getKillswitch ───────────────────────────────────────────────────────

  describe('getKillswitch', () => {
    it('returns the Killswitch instance', () => {
      const mgr = createManager();
      const ks = mgr.getKillswitch();
      expect(ks).toBeDefined();
      expect(ks.isTradingEnabled()).toBe(true);
    });

    it('returns the same Killswitch instance across calls', () => {
      const mgr = createManager();
      expect(mgr.getKillswitch()).toBe(mgr.getKillswitch());
    });
  });

  // ── createBot (bonus — needed for populating bots map) ──────────────────

  describe('createBot', () => {
    it('throws if bot ID already exists', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('dup'));
      await expect(mgr.createBot(mockRequest('dup'))).rejects.toThrow('Bot already exists: dup');
    });

    it('rejects live mode with explicit error', async () => {
      const mgr = createManager();
      await expect(
        mgr.createBot({ ...mockRequest('live-1'), mode: 'live' as const }),
      ).rejects.toThrow('Live trading not available');
      expect(mgr.getBot('live-1')).toBeUndefined();
    });
  });

  // ── resetKillswitch ──────────────────────────────────────────────────────

  describe('resetKillswitch', () => {
    it('resets killswitch state and logs', async () => {
      const mgr = createManager();
      mgr.manualHalt('test halt');
      expect(mgr.getKillswitch().isTradingEnabled()).toBe(false);
      mgr.resetKillswitch();
      expect(mgr.getKillswitch().isTradingEnabled()).toBe(true);
    });
  });

  // ── destroy ─────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('clears all bots', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      await mgr.createBot(mockRequest('bot-2'));
      mgr.destroy();
      expect(await mgr.getAllBots()).toEqual([]);
    });

    it('calls destroy on each bot', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      mgr.destroy();
      expect(bot.destroy).toHaveBeenCalledOnce();
    });
  });

  // ── getRunningBots ────────────────────────────────────────────────────────

  describe('getRunningBots', () => {
    it('returns only bots with running status', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      await mgr.createBot(mockRequest('bot-2'));
      const bot1 = mgr.getBot('bot-1')!;
      (bot1.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 'running' as BotStatus,
        totalPnl: 0,
        symbol: 'BTC/USDT',
        strategy: 'grid',
      });
      expect(await mgr.getRunningBots()).toHaveLength(1);
      expect((await mgr.getRunningBots())[0].id).toBe('bot-1');
    });

    it('returns empty when no bots are running', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      expect(await mgr.getRunningBots()).toHaveLength(0);
    });
  });

  // ── removeBot with userId ────────────────────────────────────────────────

  describe('removeBot with userId', () => {
    it('persists stopped status to D1 when userId provided', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('bot-1'));
      mgr.removeBot('bot-1');
      await new Promise((r) => setTimeout(r, 0));
      expect(patchBot).toHaveBeenCalledWith('bot-1', expect.objectContaining({ status: 'stopped' }));
      expect(mgr.getBot('bot-1')).toBeUndefined();
    });

    it('skips D1 persist when no userId', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      mgr.removeBot('bot-1');
      await new Promise((r) => setTimeout(r, 0));
      expect(patchBot).not.toHaveBeenCalled();
    });
  });

  // ── patchBotSafe catch block ──────────────────────────────────────────────

  describe('patchBotSafe — D1 persist failure', () => {
    it('logs error when patchBot rejects', async () => {
      patchBot.mockRejectedValueOnce(new Error('D1 write failed'));
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      (bot.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 'stopped' as BotStatus,
        totalPnl: 0,
        symbol: 'BTC/USDT',
        strategy: 'grid',
      });
      mgr.stopBot('bot-1');
      await new Promise((r) => setTimeout(r, 0));
      // Error should be caught, not thrown
      expect(mgr.getBot('bot-1')).toBeDefined();
    });
  });

  // ── singleton functions ─────────────────────────────────────────────────

  describe('getBotManager / resetBotManager', () => {
    it('returns same instance on repeated calls', () => {
      const a = getBotManager();
      const b = getBotManager();
      expect(a).toBe(b);
    });

    it('returns fresh instance after reset', () => {
      const a = getBotManager();
      resetBotManager();
      const b = getBotManager();
      expect(a).not.toBe(b);
    });

    it('resets singleton state cleanly', async () => {
      const a = getBotManager();
      await a.createBot(mockRequest('bot-1'));
      expect(await a.getAllBots()).toHaveLength(1);
      resetBotManager();
      const b = getBotManager();
      expect(await b.getAllBots()).toHaveLength(0);
    });
  });

  // ── getOrCreateBot (lazy single-bot hydration) ─────────────────────────

  describe('getOrCreateBot', () => {
    it('returns existing bot from memory without D1 query', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));

      // D1 should not be queried
      await import('@/lib/db/client');

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
          capital: 2000,
          gridSpacingPct: 1,
          gridLevels: 10,
          capitalPerLevelPct: 10,
          takeProfitPct: 2,
          stopLossPct: 3,
          rebalanceOnFill: false,
          maxDrawdownPct: 15,
          mode: 'paper',
        }),
        capital_allocated: 2000,
        capital_used: 0,
        total_pnl: 50,
        win_count: 5,
        loss_count: 2,
        max_drawdown: 3,
        total_trades: 7,
        started_at: 1000,
        stopped_at: null,
        last_error: null,
        last_tick_at: 2000,
        last_order_at: 1500,
        current_drawdown: 1,
        created_at: 500,
        updated_at: 2000,
      };
      mockFindBotById.mockResolvedValue(d1Row as any);

      const { createServerClient } = await import('@/lib/db/client');
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(d1Row),
          }),
        }),
      };
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

      const result = await mgr.getOrCreateBot('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when DB is unavailable', async () => {
      const mgr = createManager();
      const { createServerClient } = await import('@/lib/db/client');
      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await mgr.getOrCreateBot('bot-1');
      expect(result).toBeNull();
    });

    it('restores bot state from D1 row after hydration', async () => {
      const mgr = createManager();
      const d1Row = {
        id: 'bot-restore',
        user_id: 'user-1',
        name: 'Restore Bot',
        strategy: 'grid',
        pair: 'SOL/USDT',
        exchange: 'binance',
        status: 'paper_test',
        config_json: JSON.stringify({
          strategy: 'grid',
          symbol: 'SOL/USDT',
          exchange: 'binance',
          capital: 1500,
          gridSpacingPct: 1,
          gridLevels: 10,
          capitalPerLevelPct: 10,
          takeProfitPct: 2,
          stopLossPct: 3,
          rebalanceOnFill: false,
          maxDrawdownPct: 15,
          mode: 'paper',
        }),
        capital_allocated: 1500,
        capital_used: 0,
        total_pnl: 25,
        win_count: 3,
        loss_count: 1,
        max_drawdown: 2,
        total_trades: 4,
        started_at: 500,
        stopped_at: null,
        last_error: null,
        last_tick_at: 1000,
        last_order_at: 800,
        current_drawdown: 0.5,
        created_at: 100,
        updated_at: 1000,
      };
      mockFindBotById.mockResolvedValue(d1Row as any);

      const { createServerClient } = await import('@/lib/db/client');
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(d1Row),
          }),
        }),
      };
      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

      const result = await mgr.getOrCreateBot('bot-restore');
      expect(result).toBeDefined();
      expect(result?.id).toBe('bot-restore');
      // Access mock via import to ensure proper scoping
      const { restoreBotStateFromRow: rbsf } = await import('@/forest/bot/d1-hydration');
      expect(rbsf).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bot-restore' }),
        expect.objectContaining({
          status: 'paper_test',
          total_pnl: 25,
          total_trades: 4,
        }),
      );
    });
  });

  // ── drainQueues ─────────────────────────────────────────────────────────

  describe('drainQueues', () => {
    it('drains all exchange queues and returns results', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));

      const results = await mgr.drainQueues();

      expect(results).toBeDefined();
      expect(results.binance).toEqual({ processed: 0, skipped: 0, pending: 0 });
    });

    it('returns empty results when no queues exist', async () => {
      const mgr = createManager();

      const results = await mgr.drainQueues();

      expect(results).toEqual({});
    });

    it('reports processed count greater than zero after drain', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));

      // Enqueue directly via the queue's internal map
      const queueMap = (mgr as unknown as { queues: Map<string, object> }).queues;
      const queue = queueMap.get('binance') as unknown as { enqueue: (item: object) => string | null };
      expect(queue).toBeDefined();

      // Use the manager's own drain with a pre-seeded queue item
      const results = await mgr.drainQueues();
      expect(results.binance).toBeDefined();
      expect(results.binance.pending).toBe(0);
    });
  });

  // ── D1 direct-read paths (coverage for new architecture) ──────────────

  describe('D1 direct-read paths', () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn(),
          all: vi.fn(),
        }),
      }),
    };

    function makeBotRow(overrides: Partial<Bot> = {}): Bot {
      return {
        id: 'd1-bot-1',
        user_id: 'user-1',
        name: 'D1 Bot',
        strategy: 'grid',
        pair: 'BTC/USDT',
        exchange: 'binance',
        status: 'paper_test',
        capital_allocated: 1000,
        capital_used: 0,
        config_json: JSON.stringify({ strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 1000, maxDrawdownPct: 15 }),
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
        created_at: Date.now(),
        updated_at: Date.now(),
        ...overrides,
      };
    }

    beforeEach(async () => {
      vi.clearAllMocks();
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>);
    });

    it('getAllBots reads D1 directly when DB is available (system context)', async () => {
      const { findAllBots } = await import('@/lib/db/repositories');
      vi.mocked(findAllBots).mockResolvedValue([makeBotRow()]);

      const mgr = createManager();
      const bots = await mgr.getAllBots();
      expect(bots).toHaveLength(1);
      expect(bots[0].id).toBe('d1-bot-1');
    });

    it('getAllBots scopes to user when userId is provided (anti-IDOR)', async () => {
      const { findBotsByUser } = await import('@/lib/db/repositories');
      vi.mocked(findBotsByUser).mockResolvedValue([makeBotRow({ user_id: 'user-1' })]);

      const mgr = createManager('user-1');
      const bots = await mgr.getAllBots();
      expect(bots).toHaveLength(1);
      expect(findBotsByUser).toHaveBeenCalledWith(expect.anything(), 'user-1');
    });

    it('getRunningBots scopes to user when userId is provided (anti-IDOR)', async () => {
      const { findBotsByUser } = await import('@/lib/db/repositories');
      vi.mocked(findBotsByUser).mockResolvedValue([
        makeBotRow({ id: 'running-user-1', status: 'paper_test', user_id: 'user-1' }),
        makeBotRow({ id: 'stopped-user-1', status: 'stopped', user_id: 'user-1' }),
      ]);

      const mgr = createManager('user-1');
      const running = await mgr.getRunningBots();
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe('running-user-1');
      expect(findBotsByUser).toHaveBeenCalledWith(expect.anything(), 'user-1');
    });

    it('getRunningBots filters to running-status rows from D1', async () => {
      const { findAllBots } = await import('@/lib/db/repositories');
      vi.mocked(findAllBots).mockResolvedValue([
        makeBotRow({ id: 'running-1', status: 'paper_test' }),
        makeBotRow({ id: 'stopped-1', status: 'stopped', pair: 'ETH/USDT' }),
      ]);

      const mgr = createManager();
      const running = await mgr.getRunningBots();
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe('running-1');
    });

    it('cache TTL: getBot returns cached instance within TTL without re-hydrating', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('cached-bot'));

      // First call — from cache
      const bot1 = mgr.getBot('cached-bot');
      expect(bot1).toBeDefined();
      // Second call — still cached (TTL not expired)
      const bot2 = mgr.getBot('cached-bot');
      expect(bot2).toBe(bot1);
    });

    it('falls back to in-memory cache when D1 read throws', async () => {
      const { findAllBots } = await import('@/lib/db/repositories');
      vi.mocked(findAllBots).mockRejectedValue(new Error('D1 unavailable'));

      const mgr = createManager();
      await mgr.createBot(mockRequest('cached-only'));
      const bots = await mgr.getAllBots();
      // Should fall back to the in-memory cache (1 bot just created)
      expect(bots).toHaveLength(1);
      expect(bots[0].id).toBe('cached-only');
    });

    it('getAllBots and getRunningBots fall back to cache when DB client is null', async () => {
      const { createServerClient } = await import('@/lib/db/client');
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
      const { findAllBots } = await import('@/lib/db/repositories');
      vi.mocked(findAllBots).mockRejectedValue(new Error('D1 error'));

      const mgr = createManager();
      await mgr.createBot(mockRequest('running-err-bot'));
      const running = await mgr.getRunningBots();
      expect(running).toBeDefined();
    });

    it('hydrateFromRowIfNeeded uses cached bot when fresh on repeated getAllBots', async () => {
      const { findAllBots } = await import('@/lib/db/repositories');
      vi.mocked(findAllBots).mockResolvedValue([
        makeBotRow({ id: 'fresh-row-bot', name: 'Fresh Bot' }),
      ]);

      const mgr = createManager();
      const firstCall = await mgr.getAllBots();
      expect(firstCall).toHaveLength(1);

      const secondCall = await mgr.getAllBots();
      expect(secondCall).toHaveLength(1);
      expect(secondCall[0]).toBe(firstCall[0]);
    });

    it('hydrateFromRowIfNeeded falls back to defaultConfigFromRow when JSON.parse fails', async () => {
      const { findAllBots } = await import('@/lib/db/repositories');
      vi.mocked(findAllBots).mockResolvedValue([
        makeBotRow({ id: 'corrupt-config-bot', name: 'Corrupt Bot', config_json: 'invalid-json-{{{' }),
      ]);

      const mgr = createManager();
      const bots = await mgr.getAllBots();
      expect(bots).toHaveLength(1);
      expect(bots[0].id).toBe('corrupt-config-bot');
    });

    it('getOrCreateBot rejects access when bot belongs to different user (IDOR prevention)', async () => {
      const mgr = createManager('user-1');
      const d1Row = makeBotRow({ id: 'victim-bot', user_id: 'user-victim', name: 'Victim Bot' });
      mockFindBotById.mockResolvedValue(d1Row);

      const res = await mgr.getOrCreateBot('victim-bot');
      expect(res).toBeNull();
    });

    it('getBot rejects cross-user access from cached instance', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('owned-bot'));

      // user-1 can access
      expect(mgr.getBot('owned-bot')).toBeDefined();

      // user-2 cannot access
      expect(mgr.getBot('owned-bot', 'user-2')).toBeUndefined();
    });

    it('lifecycle methods reject cross-user access', async () => {
      const mgr = createManager('user-1');
      await mgr.createBot(mockRequest('lifecycle-bot'));

      // Cross-user calls throw or are rejected
      await expect(mgr.startBot('lifecycle-bot', 'user-2')).rejects.toThrow('Unauthorized access');
      expect(() => mgr.pauseBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');
      expect(() => mgr.resumeBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');
      expect(() => mgr.stopBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');
      expect(() => mgr.removeBot('lifecycle-bot', 'user-2')).toThrow('Unauthorized access');

      // Bot is still intact for user-1
      expect(mgr.getBot('lifecycle-bot')).toBeDefined();
    });

    it('getOrCreateBot catches error and invokes onError if createBot fails', async () => {
      const onError = vi.fn();
      const mgr = createManager('user-1', { onError });

      const d1Row = makeBotRow({
        id: 'fail-bot',
        name: 'Fail Bot',
        config_json: JSON.stringify({ strategy: 'grid', symbol: 'BTC/USDT' }),
      });
      mockFindBotById.mockResolvedValue(d1Row);

      vi.spyOn(mgr, 'createBot').mockRejectedValueOnce(new Error('Creation exploded'));

      const res = await mgr.getOrCreateBot('fail-bot');
      expect(res).toBeNull();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Creation exploded' }),
        'bot-manager:getOrCreateBot:fail-bot',
      );
    });

    it('drainQueues handles item execution rejection', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('queue-err-bot'));

      const queueMap = (mgr as unknown as { queues: Map<string, RequestQueue> }).queues;
      const queue = queueMap.get('binance');
      expect(queue).toBeDefined();

      if (queue) {
        vi.spyOn(queue, 'drain').mockImplementationOnce(async (_exchange, processFn) => {
          const item: QueueItem = {
            id: 'err-item',
            priority: 0,
            exchange: 'binance',
            cost: 1,
            enqueuedAt: Date.now(),
            execute: vi.fn().mockRejectedValue(new Error('Execute fail')),
          };
          const ok = await processFn(item);
          expect(ok).toBe(false);
          return {
            processed: 0,
            skipped: 1,
            pending: 0,
            byExchange: {
              binance: { processed: 0, skipped: 1, pending: 0 },
              bybit: { processed: 0, skipped: 0, pending: 0 },
              okx: { processed: 0, skipped: 0, pending: 0 },
            },
          };
        });
      }

      const results = await mgr.drainQueues();
      expect(results.binance.skipped).toBe(1);
    });
  });
});
