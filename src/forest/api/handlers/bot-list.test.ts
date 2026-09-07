import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListBots = vi.fn().mockResolvedValue([]);
vi.mock('@/forest/bot/d1-adapter', () => ({
  BotQueryService: vi.fn().mockImplementation(() => ({
    listBots: mockListBots,
  })),
}));

import { botListHandler } from './bot-list';

describe('botListHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBots.mockResolvedValue([]);
  });

  describe('successful retrieval', () => {
    it('returns empty list when no bots exist', async () => {
      mockListBots.mockResolvedValue([]);

      const result = await botListHandler();

      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
      expect(mockListBots).toHaveBeenCalledOnce();
    });

    it('returns bot list items with correct fields', async () => {
      mockListBots.mockResolvedValue([{
        id: 'test-bot-1',
        name: 'Test Bot',
        strategy: 'grid',
        pair: 'BTC/USDT',
        exchange: 'binance',
        status: 'running',
        mode: 'paper',
        config: { capital: 1000 },
        metrics: {
          totalPnl: 125.5,
          winCount: 8,
          lossCount: 2,
          maxDrawdown: 5,
          currentDrawdown: 2,
          totalTrades: 10,
          startedAt: Date.now() - 100000,
          stoppedAt: null,
          lastTickAt: Date.now(),
          lastOrderAt: null,
          lastError: null,
        },
        createdAt: Date.now() - 100000,
        updatedAt: Date.now(),
      }]);

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
      mockListBots.mockResolvedValue([
        {
          id: 'bot-1',
          name: 'Bot 1',
          strategy: 'grid',
          pair: 'ETH/USDT',
          exchange: 'binance',
          status: 'running',
          mode: 'paper',
          config: { capital: 1000 },
          metrics: {
            totalPnl: 0, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0,
            totalTrades: 0, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'bot-2',
          name: 'Bot 2',
          strategy: 'mean_reversion',
          pair: 'SOL/USDT',
          exchange: 'bybit',
          status: 'paused',
          mode: 'paper',
          config: { capital: 2000 },
          metrics: {
            totalPnl: 0, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0,
            totalTrades: 0, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

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
    it('preserves strategy type', async () => {
      mockListBots.mockResolvedValue([{
        id: 'test-bot-1',
        name: 'Test Bot',
        strategy: 'mean_reversion',
        pair: 'BTC/USDT',
        exchange: 'binance',
        status: 'running',
        mode: 'paper',
        config: { capital: 1000 },
        metrics: {
          totalPnl: 0, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0,
          totalTrades: 0, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }]);

      const result = await botListHandler();

      expect(result.data![0].strategy).toBe('mean_reversion');
    });
  });

  describe('error handling', () => {
    it('returns error when listBots throws', async () => {
      mockListBots.mockRejectedValue(new Error('D1 connection failed'));

      const result = await botListHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('D1 connection failed');
    });

    it('returns generic error for non-Error exceptions', async () => {
      mockListBots.mockImplementation(() => {
        throw 'unexpected';
      });

      const result = await botListHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to list bots');
    });
  });
});
