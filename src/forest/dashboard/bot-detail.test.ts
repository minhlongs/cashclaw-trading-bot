import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(),
  isGridConfig: vi.fn((cfg: any) => cfg.strategy === 'grid'),
  isMeanRevConfig: vi.fn((cfg: any) => cfg.strategy === 'mean_reversion'),
}));

const mockManager = {
  getBot: vi.fn(),
};

function mockBotInstance(overrides: Record<string, unknown> = {}) {
  return {
    getSnapshot: () => ({
      id: 'bot-1',
      status: 'running',
      totalPnl: 150.5,
      winCount: 5,
      lossCount: 2,
      maxDrawdown: 12.5,
      startedAt: 1000,
      updatedAt: 2000,
      error: null,
      ...overrides,
    }),
    getConfig: () => ({
      strategy: 'grid',
      symbol: 'BTCUSDT',
      exchange: 'paper',
      capital: 5000,
      gridSpacingPct: 1,
      gridLevels: 5,
      capitalPerLevelPct: 20,
      maxDrawdownPct: 15,
    }),
  };
}

function mockMeanRevBot() {
  return {
    getSnapshot: () => ({
      id: 'mr-bot',
      status: 'stopped',
      totalPnl: -50,
      winCount: 1,
      lossCount: 3,
      maxDrawdown: 20,
      startedAt: null,
      updatedAt: 3000,
      error: null,
    }),
    getConfig: () => ({
      strategy: 'mean_reversion',
      symbol: 'ETHUSDT',
      exchange: 'binance',
      capital: 2000,
      bbPeriod: 20,
      bbStdDev: 2,
      rsiPeriod: 14,
      rsiBuyThreshold: 30,
      rsiSellThreshold: 70,
      volumeMultiplier: 1.5,
      positionSizePct: 10,
      maxDrawdownPct: 25,
    }),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { getBotManager } = await import('@/tree/bot');
  vi.mocked(getBotManager).mockReturnValue(mockManager as any);
});

describe('bot-detail', () => {
  describe('getBotDetail', () => {
    it('returns BotDetailData for grid bot', async () => {
      mockManager.getBot.mockReturnValue(mockBotInstance());
      const { getBotDetail } = await import('./bot-detail');
      const detail = await getBotDetail('bot-1');
      expect(detail).not.toBeNull();
      expect(detail!.id).toBe('bot-1');
      expect(detail!.strategy).toBe('grid');
      expect(detail!.pair).toBe('BTCUSDT');
      expect(detail!.totalPnl).toBe(150.5);
      expect(detail!.capitalAllocated).toBe(5000);
      expect(detail!.config).toEqual({
        spacingPct: 1,
        levels: 5,
        capitalPerLevelPct: 20,
        maxDrawdownPct: 15,
      });
    });

    it('returns BotDetailData for mean reversion bot', async () => {
      mockManager.getBot.mockReturnValue(mockMeanRevBot());
      const { getBotDetail } = await import('./bot-detail');
      const detail = await getBotDetail('mr-bot');
      expect(detail).not.toBeNull();
      expect(detail!.strategy).toBe('mean_reversion');
      expect(detail!.pair).toBe('ETHUSDT');
      expect(detail!.config).toEqual({
        bbPeriod: 20,
        bbStdDev: 2,
        rsiPeriod: 14,
        rsiBuyThreshold: 30,
        rsiSellThreshold: 70,
        volumeMultiplier: 1.5,
        positionSizePct: 10,
        maxDrawdownPct: 25,
      });
    });

    it('returns null when bot not found', async () => {
      mockManager.getBot.mockReturnValue(undefined);
      const { getBotDetail } = await import('./bot-detail');
      const detail = await getBotDetail('nonexistent');
      expect(detail).toBeNull();
    });

    it('sets capitalUsed to capital * 0.49 rounded', async () => {
      mockManager.getBot.mockReturnValue(mockBotInstance());
      const { getBotDetail } = await import('./bot-detail');
      const detail = await getBotDetail('bot-1');
      expect(detail!.capitalUsed).toBe(2450); // 5000 * 0.49
    });
  });

  describe('getTradeHistory', () => {
    it('returns empty array (not yet implemented)', async () => {
      const { getTradeHistory } = await import('./bot-detail');
      const result = await getTradeHistory('bot-1');
      expect(result).toEqual([]);
    });
  });

  describe('getAllBots', () => {
    it('delegates to getBotCards', async () => {
      vi.mock('./bot-kpis', () => ({
        getBotCards: vi.fn().mockResolvedValue([{ id: 'bot-1', name: 'bot-1' }]),
      }));
      const { getAllBots } = await import('./bot-detail');
      const result = await getAllBots();
      expect(result).toHaveLength(1);
    });
  });
});
