import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures these are available inside the vi.mock factory (which is hoisted)
const { mockKillswitch, mockManager } = vi.hoisted(() => {
  const mockKillswitch = {
    isTradingEnabled: vi.fn().mockReturnValue(true),
    manualHalt: vi.fn(),
    manualResume: vi.fn(),
    reset: vi.fn(),
  };
  const mockManager = {
    getKillswitch: vi.fn(),
    getRunningBots: vi.fn().mockReturnValue([]),
    getAllBots: vi.fn().mockReturnValue([]),
  };
  return { mockKillswitch, mockManager };
});

// Mock external dependencies
vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn().mockReturnValue(mockManager),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

vi.mock('@/land/exchange-orchestration', () => ({
  getExchangeOrchestrator: vi.fn().mockReturnValue(null),
}));

import { BotScheduler } from './scheduler';

function makeMockBot(id: string, overrides: { tickError?: Error } = {}) {
  return {
    id,
    tick: overrides.tickError
      ? vi.fn().mockRejectedValue(overrides.tickError)
      : vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue({ exchange: 'paper', symbol: 'BTC/USDT', capital: 1000 }),
    getSnapshot: vi.fn().mockReturnValue({ id, totalPnl: 0 }),
  };
}

describe('BotScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillswitch.isTradingEnabled.mockReturnValue(true);
    mockManager.getKillswitch.mockReturnValue(mockKillswitch);
    mockManager.getRunningBots.mockReturnValue([]);
  });

  describe('tick when halted', () => {
    it('returns halted: true and 0 bots evaluated', async () => {
      mockKillswitch.isTradingEnabled.mockReturnValue(false);
      const scheduler = new BotScheduler();
      const report = await scheduler.tick();
      expect(report.halted).toBe(true);
      expect(report.botsEvaluated).toBe(0);
      expect(report.errors).toEqual([]);
    });
  });

  describe('tick with no running bots', () => {
    it('returns 0 bots evaluated and no errors', async () => {
      mockManager.getRunningBots.mockReturnValue([]);
      const scheduler = new BotScheduler();
      const report = await scheduler.tick();
      expect(report.halted).toBe(false);
      expect(report.botsEvaluated).toBe(0);
      expect(report.errors).toEqual([]);
    });
  });

  describe('tick with running bots', () => {
    it('evaluates each running bot', async () => {
      const b1 = makeMockBot('b1');
      const b2 = makeMockBot('b2');
      mockManager.getRunningBots.mockReturnValue([b1, b2]);
      const scheduler = new BotScheduler();
      const report = await scheduler.tick();
      expect(report.botsEvaluated).toBe(2);
      expect(b1.tick).toHaveBeenCalledTimes(1);
      expect(b2.tick).toHaveBeenCalledTimes(1);
    });
  });

  describe('tick error handling', () => {
    it('captures tick errors in report', async () => {
      const failBot = makeMockBot('fail-bot', { tickError: new Error('tick failed') });
      const okBot = makeMockBot('ok-bot');
      mockManager.getRunningBots.mockReturnValue([failBot, okBot]);
      const scheduler = new BotScheduler();
      const report = await scheduler.tick();
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toEqual({ botId: 'fail-bot', message: 'tick failed' });
      expect(report.botsEvaluated).toBe(2);
    });

    it('calls onEvalError for each failed bot', async () => {
      const onEvalError = vi.fn();
      const failBot = makeMockBot('x', { tickError: new Error('boom') });
      mockManager.getRunningBots.mockReturnValue([failBot]);
      const scheduler = new BotScheduler({ onEvalError });
      await scheduler.tick();
      expect(onEvalError).toHaveBeenCalledTimes(1);
      expect(onEvalError).toHaveBeenCalledWith('x', expect.any(Error));
    });
  });

  describe('getStats', () => {
    it('returns initial stats before any tick', () => {
      const scheduler = new BotScheduler();
      const stats = scheduler.getStats();
      expect(stats.tickCount).toBe(0);
      expect(stats.lastTickAt).toBeNull();
    });

    it('updates stats after tick', async () => {
      const scheduler = new BotScheduler();
      await scheduler.tick();
      const stats = scheduler.getStats();
      expect(stats.tickCount).toBe(1);
      expect(stats.lastTickAt).toBeTypeOf('number');
    });

    it('increments tick count across multiple ticks', async () => {
      const scheduler = new BotScheduler();
      await scheduler.tick();
      await scheduler.tick();
      await scheduler.tick();
      expect(scheduler.getStats().tickCount).toBe(3);
    });
  });
});
