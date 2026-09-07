import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/tree/bot', () => ({
  isGridConfig: vi.fn((cfg: { strategy?: string }) => cfg.strategy === 'grid'),
  isMeanRevConfig: vi.fn((cfg: { strategy?: string }) => cfg.strategy === 'mean_reversion'),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
}));

function mockD1(rows: Array<{ id: string; detail_json: string; created_at: number }>) {
  const all = vi.fn().mockResolvedValue({ results: rows });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, all };
}

function mockGridSummary(): Record<string, unknown> {
  return {
    id: 'bot-1',
    name: 'bot-1',
    status: 'running',
    pair: 'BTCUSDT',
    strategy: 'grid',
    exchange: 'paper',
    mode: 'paper',
    config: {
      strategy: 'grid',
      symbol: 'BTCUSDT',
      exchange: 'paper',
      mode: 'paper',
      capital: 5000,
      maxDrawdownPct: 15,
      gridSpacingPct: 1,
      gridLevels: 5,
      capitalPerLevelPct: 20,
      takeProfitPct: 3,
      stopLossPct: 5,
      rebalanceOnFill: true,
    },
    metrics: {
      totalPnl: 150.5,
      winCount: 5,
      lossCount: 2,
      maxDrawdown: 12.5,
      currentDrawdown: 0,
      totalTrades: 7,
      startedAt: 1000,
      stoppedAt: null,
      lastTickAt: 2000,
      lastOrderAt: null,
      lastError: null,
    },
    createdAt: 500,
    updatedAt: 2000,
  };
}

function mockMeanRevSummary(): Record<string, unknown> {
  return {
    id: 'mr-bot',
    name: 'mr-bot',
    status: 'stopped',
    pair: 'ETHUSDT',
    strategy: 'mean_reversion',
    exchange: 'binance',
    mode: 'paper',
    config: {
      strategy: 'mean_reversion',
      symbol: 'ETHUSDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 2000,
      maxDrawdownPct: 25,
      bbPeriod: 20,
      bbStdDev: 2,
      rsiPeriod: 14,
      rsiBuyThreshold: 30,
      rsiSellThreshold: 70,
      volumeMultiplier: 1.5,
      positionSizePct: 10,
      cooldownMinutes: 5,
    },
    metrics: {
      totalPnl: -50,
      winCount: 1,
      lossCount: 3,
      maxDrawdown: 20,
      currentDrawdown: 0,
      totalTrades: 4,
      startedAt: null,
      stoppedAt: null,
      lastTickAt: 3000,
      lastOrderAt: null,
      lastError: null,
    },
    createdAt: 500,
    updatedAt: 3000,
  };
}

const mockGetBot = vi.fn();
vi.mock('@/forest/bot/d1-adapter', () => ({
  BotQueryService: vi.fn().mockImplementation(() => ({
    getBot: mockGetBot,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBot.mockResolvedValue(null);
});

describe('bot-detail', () => {
  describe('getBotDetail', () => {
    it('returns BotDetailData for grid bot', async () => {
      mockGetBot.mockResolvedValue(mockGridSummary());
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
      mockGetBot.mockResolvedValue(mockMeanRevSummary());
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
      mockGetBot.mockResolvedValue(null);
      const { getBotDetail } = await import('./bot-detail');
      const detail = await getBotDetail('nonexistent');
      expect(detail).toBeNull();
    });

    it('sets capitalUsed to capital * 0.49 rounded', async () => {
      mockGetBot.mockResolvedValue(mockGridSummary());
      const { getBotDetail } = await import('./bot-detail');
      const detail = await getBotDetail('bot-1');
      expect(detail!.capitalUsed).toBe(2450); // 5000 * 0.49
    });
  });

  describe('getTradeHistory', () => {
    it('queries D1 and maps fill events to TradeRow', async () => {
      const db = mockD1([
        { id: 'evt-1', detail_json: JSON.stringify({ side: 'buy', price: 45000, quantity: 0.1, pnl: 50 }), created_at: 1000 },
        { id: 'evt-2', detail_json: JSON.stringify({ side: 'sell', price: 46000, quantity: 0.1, pnl: 100 }), created_at: 2000 },
      ]);
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);

      const { getTradeHistory } = await import('./bot-detail');
      const result = await getTradeHistory('bot-1', 10);

      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('trade_events'));
      const preparedObj = db.prepare.mock.results[0].value;
      expect(preparedObj.bind).toHaveBeenCalledWith('bot-1', 'fill', 10);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'evt-1', side: 'buy', price: 45000, quantity: 0.1, pnl: 50, status: 'filled', openedAt: 1000 });
      expect(result[1]).toEqual({ id: 'evt-2', side: 'sell', price: 46000, quantity: 0.1, pnl: 100, status: 'filled', openedAt: 2000 });
    });

    it('returns empty when D1 unavailable', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(null);

      const { getTradeHistory } = await import('./bot-detail');
      const result = await getTradeHistory('bot-1');
      expect(result).toEqual([]);
    });

    it('returns empty on D1 query error', async () => {
      const db = { prepare: vi.fn().mockImplementation(() => { throw new Error('D1 fail'); }) };
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);

      const { getTradeHistory } = await import('./bot-detail');
      const result = await getTradeHistory('bot-1');
      expect(result).toEqual([]);
    });

    it('handles malformed detail_json gracefully', async () => {
      const db = mockD1([
        { id: 'evt-bad', detail_json: 'not-json', created_at: 3000 },
      ]);
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);

      const { getTradeHistory } = await import('./bot-detail');
      const result = await getTradeHistory('bot-1');
      expect(result).toHaveLength(1);
      expect(result[0].side).toBe('buy');
      expect(result[0].price).toBe(0);
    });

    it('defaults missing fields in details', async () => {
      const db = mockD1([
        { id: 'evt-empty', detail_json: JSON.stringify({}), created_at: 4000 },
      ]);
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);

      const { getTradeHistory } = await import('./bot-detail');
      const result = await getTradeHistory('bot-1');
      expect(result[0]).toEqual({ id: 'evt-empty', side: 'buy', price: 0, quantity: 0, pnl: null, status: 'filled', openedAt: 4000 });
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
