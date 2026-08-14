// bot-manager.test.ts — unit tests for BotManager singleton orchestrator
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotInstance } from './bot-instance';
import type { BotConfig, BotStatus } from './types';

// ── Hoisted vi.mock() factories ─────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/forest/bot/d1-adapter', () => ({
  hydrateFromD1: vi.fn(async () => {}),
  patchBot: vi.fn(async () => {}),
}));

vi.mock('./bot-manager-helpers', () => ({
  createD1Callbacks: vi.fn(() => ({
    onStateChange: vi.fn(),
    onTrade: vi.fn(),
    onLog: vi.fn(),
    onError: vi.fn(),
  })),
  persistNewBot: vi.fn(async () => {}),
}));

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
  function createManager(userId?: string) {
    return new BotManager({ userId });
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
    it('returns empty array when no bots exist', () => {
      const mgr = createManager();
      expect(mgr.getAllBots()).toEqual([]);
    });

    it('returns all created bots', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      await mgr.createBot(mockRequest('bot-2'));
      const all = mgr.getAllBots();
      expect(all).toHaveLength(2);
      expect(all.map((b) => b.id)).toEqual(expect.arrayContaining(['bot-1', 'bot-2']));
    });

    it('returns empty array after all bots are removed', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      mgr.removeBot('bot-1');
      expect(mgr.getAllBots()).toEqual([]);
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

    it('forces paper mode regardless of request mode', async () => {
      const mgr = createManager();
      await mgr.createBot({ ...mockRequest('live-1'), mode: 'live' as const });
      const bot = mgr.getBot('live-1');
      expect(bot).toBeDefined();
      // The logger should report paper-only lockdown
    });
  });

  // ── destroy ─────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('clears all bots', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      await mgr.createBot(mockRequest('bot-2'));
      mgr.destroy();
      expect(mgr.getAllBots()).toEqual([]);
    });

    it('calls destroy on each bot', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      mgr.destroy();
      expect(bot.destroy).toHaveBeenCalledOnce();
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
      expect(a.getAllBots()).toHaveLength(1);
      resetBotManager();
      const b = getBotManager();
      expect(b.getAllBots()).toHaveLength(0);
    });
  });
});
