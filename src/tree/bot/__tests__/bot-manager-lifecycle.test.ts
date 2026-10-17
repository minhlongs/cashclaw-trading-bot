import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupMocks, mockRequest } from './bot-manager-test-utils';

setupMocks();

import { BotManager, resetBotManager } from '../bot-manager';

describe('BotManager — Lifecycle operations', () => {
  function createManager(userId?: string) {
    return new BotManager({ userId });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetBotManager();
  });

  describe('createBot', () => {
    it('creates and returns a new BotInstance with id', async () => {
      const mgr = createManager();
      const bot = await mgr.createBot(mockRequest('test-1'));
      expect(bot).toBeDefined();
      expect(bot.id).toBe('test-1');
    });

    it('generates random id if not provided', async () => {
      const mgr = createManager();
      const req = mockRequest('');
      const bot = await mgr.createBot(req);
      expect(bot).toBeDefined();
      expect(bot.id).toMatch(/^bot-/);
    });

    it('stores bot in internal map', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('bot-abc'));
      expect(mgr.getBot('bot-abc')).toBeDefined();
    });

    it('throws if bot with same id already exists', async () => {
      const mgr = createManager();
      await mgr.createBot(mockRequest('duplicate'));
      await expect(mgr.createBot(mockRequest('duplicate'))).rejects.toThrow(
        'Bot already exists: duplicate'
      );
    });
  });

  describe('getBot and getAllBots', () => {
    it('returns undefined for non-existent bot', () => {
      const mgr = createManager();
      expect(mgr.getBot('does-not-exist')).toBeUndefined();
    });

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
  });

  describe('removeBot and destroy', () => {
    it('destroys and removes bot from map', async () => {
      const mgr = createManager();
      const bot = await mgr.createBot(mockRequest('bot-rm'));
      const destroySpy = vi.spyOn(bot, 'destroy');

      mgr.removeBot('bot-rm');

      expect(destroySpy).toHaveBeenCalledOnce();
      expect(mgr.getBot('bot-rm')).toBeUndefined();
    });

    it('handles removing non-existent bot gracefully', () => {
      const mgr = createManager();
      expect(() => mgr.removeBot('ghost')).not.toThrow();
    });

    it('destroy stops and cleans up all bots', async () => {
      const mgr = createManager();
      const b1 = await mgr.createBot(mockRequest('b1'));
      const b2 = await mgr.createBot(mockRequest('b2'));

      const s1 = vi.spyOn(b1, 'destroy');
      const s2 = vi.spyOn(b2, 'destroy');

      await mgr.destroy();

      expect(s1).toHaveBeenCalled();
      expect(s2).toHaveBeenCalled();
      expect(mgr.getBot('b1')).toBeUndefined();
      expect(mgr.getBot('b2')).toBeUndefined();
    });
  });
});
