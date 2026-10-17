import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupMocks, mockRequest } from './bot-manager-test-utils';
import type { BotStatus } from '../types';

setupMocks();

import { BotManager, resetBotManager } from '../bot-manager';

describe('BotManager — Execution & Control operations', () => {
  function createManager(userId?: string) {
    return new BotManager({ userId });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetBotManager();
  });

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
      (bot.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('exchange down'));
      await expect(mgr.startBot('bot-1')).rejects.toThrow('exchange down');
    });
  });

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
  });

  describe('pauseBot and resumeBot', () => {
    it('pause throws error when bot not found', () => {
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

    it('resume throws error when bot not found', () => {
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
  });

  describe('manualHalt and getRunningBots', () => {
    it('halts the killswitch with the given reason', () => {
      const mgr = createManager();
      mgr.manualHalt('operator pause');
      const ks = mgr.getKillswitch();
      expect(ks.isTradingEnabled()).toBe(false);
    });

    it('returns running bots', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-1'));
      const bot = mgr.getBot('bot-1')!;
      (bot.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 'running' as BotStatus,
        totalPnl: 0,
        symbol: 'BTC/USDT',
        strategy: 'grid',
      });
      const running = await mgr.getRunningBots();
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe('bot-1');
    });
  });
});
