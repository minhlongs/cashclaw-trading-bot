import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(),
}));

vi.mock('@/forest/bot/d1-adapter', () => ({
  loadAllBotsFromD1: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

import { botListHandler } from './bot-list';
import { getBotManager } from '@/tree/bot';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';
import { BotInstance } from '@/tree/bot/bot-instance';

const mockGetBotManager = vi.mocked(getBotManager);
const mockLoadAllBotsFromD1 = vi.mocked(loadAllBotsFromD1);

function makeBotInstance(overrides: Record<string, unknown> = {}): BotInstance {
  const defaults = {
    id: 'test-bot-1',
    status: 'running' as const,
    totalPnl: 125.5,
    winCount: 8,
    lossCount: 2,
    startedAt: Date.now() - 100000,
    updatedAt: Date.now(),
    strategy: 'grid' as const,
    symbol: 'BTC/USDT',
    exchange: 'binance',
  };

  const merged = { ...defaults, ...overrides };

  const snapshot = {
    id: merged.id,
    status: merged.status,
    totalPnl: merged.totalPnl,
    winCount: merged.winCount,
    lossCount: merged.lossCount,
    startedAt: merged.startedAt,
    updatedAt: merged.updatedAt,
  };

  const config = {
    id: merged.id,
    strategy: merged.strategy,
    symbol: merged.symbol,
    exchange: merged.exchange,
  };

  return {
    getSnapshot: vi.fn().mockReturnValue(snapshot),
    getConfig: vi.fn().mockReturnValue(config),
  } as unknown as BotInstance;
}

describe('botListHandler', () => {
  const mockManager = {
    getAllBots: vi.fn().mockReturnValue([]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBotManager.mockReturnValue(mockManager as never);
    mockManager.getAllBots.mockReturnValue([]);
    mockLoadAllBotsFromD1.mockResolvedValue(undefined);
  });

  describe('successful retrieval', () => {
    it('returns empty list when no bots exist', async () => {
      mockManager.getAllBots.mockReturnValue([]);

      const result = await botListHandler();

      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
      expect(mockLoadAllBotsFromD1).toHaveBeenCalledOnce();
    });

    it('returns bot list items with correct fields', async () => {
      const bot = makeBotInstance();
      mockManager.getAllBots.mockReturnValue([bot]);

      const result = await botListHandler();

      expect(result.ok).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        strategy: 'grid',
        pair: 'BTC/USDT',
        exchange: 'binance',
        status: 'running',
        totalPnl: expect.any(Number),
        winCount: expect.any(Number),
        lossCount: expect.any(Number),
        startedAt: expect.any(Number),
        updatedAt: expect.any(Number),
      });
    });

    it('handles multiple bots correctly', async () => {
      const bot1 = makeBotInstance({ id: 'bot-1', symbol: 'ETH/USDT' });
      const bot2 = makeBotInstance({ id: 'bot-2', symbol: 'SOL/USDT', strategy: 'mean_reversion' });
      mockManager.getAllBots.mockReturnValue([bot1, bot2]);

      const result = await botListHandler();

      expect(result.ok).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].id).toBe('bot-1');
      expect(result.data![0].pair).toBe('ETH/USDT');
      expect(result.data![1].id).toBe('bot-2');
      expect(result.data![1].strategy).toBe('mean_reversion');
    });
  });

  describe('config mapping', () => {
    it('defaults exchange to paper when not specified', async () => {
      const bot = makeBotInstance({ exchange: undefined });
      mockManager.getAllBots.mockReturnValue([bot]);

      const result = await botListHandler();

      expect(result.data![0].exchange).toBe('paper');
    });

    it('preserves strategy type', async () => {
      const bot = makeBotInstance({ strategy: 'mean_reversion' });
      mockManager.getAllBots.mockReturnValue([bot]);

      const result = await botListHandler();

      expect(result.data![0].strategy).toBe('mean_reversion');
    });
  });

  describe('error handling', () => {
    it('returns error when loadAllBotsFromD1 throws', async () => {
      mockLoadAllBotsFromD1.mockRejectedValue(new Error('D1 connection failed'));

      const result = await botListHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('D1 connection failed');
    });

    it('returns error when getAllBots throws', async () => {
      mockManager.getAllBots.mockImplementation(() => {
        throw new Error('Bot manager unavailable');
      });

      const result = await botListHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Bot manager unavailable');
    });

    it('returns generic error for non-Error exceptions', async () => {
      mockManager.getAllBots.mockImplementation(() => {
        throw 'unexpected';
      });

      const result = await botListHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to list bots');
    });

    it('returns error when bot snapshot throws', async () => {
      const bot = {
        getSnapshot: () => {
          throw new Error('Snapshot error');
        },
        getConfig: vi.fn(),
      } as unknown as BotInstance;
      mockManager.getAllBots.mockReturnValue([bot]);

      const result = await botListHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Snapshot error');
    });
  });
});
