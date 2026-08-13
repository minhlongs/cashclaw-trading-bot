import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock D1 persistence layer — avoid real DB calls
vi.mock('@/forest/bot/d1-adapter', () => ({
  persistBot: vi.fn().mockResolvedValue(undefined),
  patchBot: vi.fn().mockResolvedValue(undefined),
  persistTrade: vi.fn().mockResolvedValue(undefined),
  hydrateFromD1: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

import { BotManager } from './bot-manager';
import type { CreateBotRequest } from './bot-manager';

function makePaperRequest(id: string): CreateBotRequest {
  return {
    id,
    config: {
      id,
      name: id,
      strategy: 'grid',
      symbol: 'BTC/USDT',
      exchange: 'paper',
      capital: 1000,
      strategyConfig: { gridSpacing: 0.01, gridSize: 10 },
    } as any,
    exchangeConfig: {
      apiKey: '',
      apiSecret: '',
      passphrase: '',
      testnet: true,
      sandbox: true,
      rateLimitMs: 100,
    },
    mode: 'paper',
  };
}

function createManager() {
  const logs: string[] = [];
  const errors: Array<{ error: Error; ctx: string }> = [];
  const botEvents: Array<{ botId: string; event: string; data: Record<string, unknown> }> = [];
  const manager = new BotManager({
    onLog: (msg) => logs.push(msg),
    onError: (error, ctx) => errors.push({ error, ctx }),
    onBotEvent: (botId, event, data) => botEvents.push({ botId, event, data }),
  });
  return { manager, logs, errors, botEvents };
}

describe('BotManager', () => {
  describe('initial state', () => {
    it('starts with no bots', () => {
      const { manager } = createManager();
      expect(manager.getAllBots()).toEqual([]);
    });
  });

  describe('createBot', () => {
    it('creates a bot and stores it', async () => {
      const { manager } = createManager();
      const bot = await manager.createBot(makePaperRequest('bot-1'));
      expect(bot).toBeDefined();
      expect(manager.getAllBots()).toHaveLength(1);
      expect(manager.getAllBots()[0].id).toBe('bot-1');
    });

    it('throws on duplicate id', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('dup'));
      await expect(manager.createBot(makePaperRequest('dup'))).rejects.toThrow(
        'Bot already exists: dup',
      );
    });
  });

  describe('startBot', () => {
    it('starts a bot asynchronously (paper adapter returns last=0, so status becomes error)', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('b1'));
      await manager.startBot('b1');
      // Paper adapter returns last=0, so start() rejects with invalid price -> status='error'
      const snapshot = manager.getAllBots()[0].getSnapshot();
      expect(snapshot.status).toBe('error');
      expect(snapshot.error).toBe('Invalid price for BTC/USDT: 0');
    });

    it('throws for unknown bot', async () => {
      const { manager } = createManager();
      await expect(manager.startBot('nope')).rejects.toThrow('Bot not found: nope');
    });
  });

  describe('pauseBot / resumeBot', () => {
    it('pauses a running bot', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('p1'));
      // Patch state to 'running' directly (bypass paper adapter price=0 issue)
      manager.getAllBots()[0].patchState({ status: 'running' });
      manager.pauseBot('p1');
      expect(manager.getAllBots()[0].getSnapshot().status).toBe('paused');
    });

    it('resumeBot throws when killswitch is halted', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('rk'));
      manager.getAllBots()[0].patchState({ status: 'paused' });
      manager.manualHalt('test halt');
      expect(() => manager.resumeBot('rk')).toThrow('Cannot resume: killswitch is halted');
    });

    it('pauseBot is a no-op for non-running bot', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('idle1'));
      // Bot starts in 'idle' state — pause() only works when running
      manager.pauseBot('idle1');
      expect(manager.getAllBots()[0].getSnapshot().status).toBe('idle');
    });
  });

  describe('stopBot', () => {
    it('stops a bot in any state', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('s1'));
      manager.stopBot('s1');
      expect(manager.getAllBots()[0].getSnapshot().status).toBe('stopped');
    });
  });

  describe('removeBot', () => {
    it('removes a bot from manager', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('rm1'));
      expect(manager.getAllBots()).toHaveLength(1);
      manager.removeBot('rm1');
      expect(manager.getAllBots()).toHaveLength(0);
    });

    it('is a no-op for unknown bot', () => {
      const { manager } = createManager();
      manager.removeBot('ghost');
      expect(manager.getAllBots()).toHaveLength(0);
    });
  });

  describe('killswitch integration', () => {
    it('manualHalt stops all running bots', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('k1'));
      await manager.createBot(makePaperRequest('k2'));
      manager.getAllBots()[0].patchState({ status: 'running' });
      manager.getAllBots()[1].patchState({ status: 'running' });
      manager.manualHalt('emergency');
      expect(manager.getAllBots()[0].getSnapshot().status).toBe('stopped');
      expect(manager.getAllBots()[1].getSnapshot().status).toBe('stopped');
    });
  });

  describe('resetKillswitch', () => {
    it('logs killswitch reset', () => {
      const { manager, logs } = createManager();
      manager.resetKillswitch();
      expect(logs).toContain('Killswitch reset');
    });
  });

  describe('destroy', () => {
    it('clears all bots', async () => {
      const { manager } = createManager();
      await manager.createBot(makePaperRequest('d1'));
      await manager.createBot(makePaperRequest('d2'));
      expect(manager.getAllBots()).toHaveLength(2);
      manager.destroy();
      expect(manager.getAllBots()).toHaveLength(0);
    });
  });
});
