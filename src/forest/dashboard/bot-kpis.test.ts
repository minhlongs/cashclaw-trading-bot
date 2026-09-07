import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotSummary } from '@/forest/bot/d1-adapter';
import type { TradeEvent } from '@/tree/telemetry';

const mockListBots = vi.fn<() => Promise<BotSummary[]>>();
const mockGetRecentEvents = vi.fn<() => Promise<TradeEvent[]>>();

vi.mock('@/forest/bot/d1-adapter', () => ({
  BotQueryService: vi.fn().mockImplementation(() => ({
    listBots: mockListBots,
  })),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./trade-events', () => ({ getRecentEvents: mockGetRecentEvents }));

function mockSummary(overrides: Partial<BotSummary> = {}): BotSummary {
  return {
    id: 'bot-1',
    name: 'bot-1',
    status: 'idle',
    pair: 'BTC/USDT',
    strategy: 'grid',
    exchange: 'binance',
    mode: 'live',
    config: {
      strategy: 'grid',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'live',
      capital: 1000,
      maxDrawdownPct: 10,
      gridSpacingPct: 1,
      gridLevels: 10,
      capitalPerLevelPct: 10,
      takeProfitPct: 2,
      stopLossPct: 3,
      rebalanceOnFill: false,
    },
    metrics: {
      totalPnl: 0,
      winCount: 0,
      lossCount: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      totalTrades: 0,
      startedAt: null,
      stoppedAt: null,
      lastTickAt: null,
      lastOrderAt: null,
      lastError: null,
    },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as BotSummary;
}

describe('getKpis', () => {
  let getKpis: typeof import('./bot-kpis').getKpis;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetRecentEvents.mockResolvedValue([]);
    getKpis = (await import('./bot-kpis')).getKpis;
  });

  it('returns zeros for empty bot list', async () => {
    mockListBots.mockResolvedValue([]);
    const r = await getKpis();
    expect(r.totalBalance).toBe(0);
    expect(r.todayPnl).toBe(0);
    expect(r.activeBots).toBe(0);
    expect(r.totalTrades).toBe(0);
    expect(r.winRate).toBe(0);
  });

  it('counts only running bots as active', async () => {
    mockListBots.mockResolvedValue([
      mockSummary({ status: 'running' }),
      mockSummary({ id: 'b2', status: 'idle' }),
      mockSummary({ id: 'b3', status: 'running' }),
    ]);
    expect((await getKpis()).activeBots).toBe(2);
  });

  it('calculates totalBalance = capital + totalPnl per bot', async () => {
    mockListBots.mockResolvedValue([
      mockSummary({ metrics: { totalPnl: 150, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 0, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null }, config: { strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance', mode: 'live', capital: 1000, maxDrawdownPct: 10, gridSpacingPct: 1, gridLevels: 10, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 3, rebalanceOnFill: false } }),
      mockSummary({ id: 'b2', metrics: { totalPnl: -50, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 0, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null }, config: { strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance', mode: 'live', capital: 500, maxDrawdownPct: 10, gridSpacingPct: 1, gridLevels: 10, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 3, rebalanceOnFill: false } }),
    ]);
    expect((await getKpis()).totalBalance).toBe(1600);
  });

  it('sums todayPnl only for bots started today', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    mockListBots.mockResolvedValue([
      mockSummary({ metrics: { totalPnl: 100, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 0, startedAt: todayStart.getTime(), stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null } }),
      mockSummary({ id: 'b2', metrics: { totalPnl: 50, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 0, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null } }),
    ]);
    expect((await getKpis()).todayPnl).toBe(100);
  });

  it('computes winRate from totalTrades and winCount', async () => {
    mockListBots.mockResolvedValue([
      mockSummary({ metrics: { totalPnl: 0, winCount: 7, lossCount: 3, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 10, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null } }),
      mockSummary({ id: 'b2', metrics: { totalPnl: 0, winCount: 3, lossCount: 2, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 5, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null } }),
    ]);
    const r = await getKpis();
    expect(r.totalTrades).toBe(15);
    expect(r.winRate).toBe(67);
  });

  it('winRate is 0 when no trades exist', async () => {
    mockListBots.mockResolvedValue([mockSummary()]);
    const r = await getKpis();
    expect(r.winRate).toBe(0);
    expect(r.totalTrades).toBe(0);
  });

  it('stopped/error/paused bots count as inactive', async () => {
    mockListBots.mockResolvedValue([
      mockSummary({ status: 'stopped' }),
      mockSummary({ id: 'b2', status: 'error' }),
      mockSummary({ id: 'b3', status: 'paused' }),
    ]);
    expect((await getKpis()).activeBots).toBe(0);
  });
});

describe('getDashboardData', () => {
  let getDashboardData: typeof import('./bot-kpis').getDashboardData;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetRecentEvents.mockResolvedValue([]);
    getDashboardData = (await import('./bot-kpis')).getDashboardData;
  });

  it('returns empty dashboard when no bots', async () => {
    mockListBots.mockResolvedValue([]);
    const r = await getDashboardData();
    expect(r.kpis.totalBalance).toBe(0);
    expect(r.bots).toEqual([]);
    expect(r.recentEvents).toEqual([]);
  });

  it('returns card data and KPIs for populated bots', async () => {
    mockListBots.mockResolvedValue([
      mockSummary({
        id: 'grid-1',
        name: 'grid-1',
        pair: 'SOL/USDT',
        exchange: 'okx',
        metrics: { totalPnl: 100, winCount: 5, lossCount: 1, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 6, startedAt: null, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null },
        config: { strategy: 'grid', symbol: 'SOL/USDT', exchange: 'okx', mode: 'live', capital: 2000, maxDrawdownPct: 10, gridSpacingPct: 1, gridLevels: 10, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 3, rebalanceOnFill: false },
      }),
    ]);
    mockGetRecentEvents.mockResolvedValue([
      { id: 'e1', botId: 'grid-1', eventType: 'fill', details: {}, timestamp: Date.now() } as TradeEvent,
    ]);
    const r = await getDashboardData();
    expect(r.kpis.activeBots).toBe(0);
    expect(r.kpis.totalBalance).toBe(2100);
    expect(r.bots).toHaveLength(1);
    expect(r.bots[0].pair).toBe('SOL/USDT');
    expect(r.bots[0].exchange).toBe('okx');
    expect(r.bots[0].strategy).toBe('grid');
    expect(r.recentEvents).toHaveLength(1);
  });

  it('defaults exchange to "paper" when config.exchange is undefined', async () => {
    mockListBots.mockResolvedValue([
      mockSummary({ exchange: undefined as unknown as string, config: { strategy: 'grid', symbol: 'BTC/USDT', exchange: undefined as unknown as string, mode: 'live', capital: 1000, maxDrawdownPct: 10, gridSpacingPct: 1, gridLevels: 10, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 3, rebalanceOnFill: false } }),
    ]);
    const r = await getDashboardData();
    expect(r.bots[0].exchange).toBe('paper');
  });
});

describe('getBotCards', () => {
  let getBotCards: typeof import('./bot-kpis').getBotCards;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetRecentEvents.mockResolvedValue([]);
    getBotCards = (await import('./bot-kpis')).getBotCards;
  });

  it('returns empty array when no bots', async () => {
    mockListBots.mockResolvedValue([]);
    expect(await getBotCards()).toEqual([]);
  });

  it('maps summaries to card data correctly', async () => {
    mockListBots.mockResolvedValue([
      mockSummary({
        id: 'mr-1',
        name: 'mr-1',
        status: 'running',
        strategy: 'mean_reversion',
        pair: 'ETH/USDT',
        exchange: 'binance',
        metrics: { totalPnl: 50, winCount: 2, lossCount: 1, maxDrawdown: 5, currentDrawdown: 0, totalTrades: 3, startedAt: 1000, stoppedAt: null, lastTickAt: null, lastOrderAt: null, lastError: null },
        config: { strategy: 'mean_reversion', symbol: 'ETH/USDT', exchange: 'binance', mode: 'live', capital: 500, maxDrawdownPct: 10, bbPeriod: 20, bbStdDev: 2, rsiPeriod: 14, rsiBuyThreshold: 30, rsiSellThreshold: 70, volumeMultiplier: 1.5, positionSizePct: 10, cooldownMinutes: 5 },
        updatedAt: 2000,
      }),
    ]);
    const cards = await getBotCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      id: 'mr-1', name: 'mr-1', strategy: 'mean_reversion', pair: 'ETH/USDT',
      exchange: 'binance', botStatus: 'running', totalPnl: 50, winCount: 2,
      lossCount: 1, startedAt: 1000, updatedAt: 2000, capitalAllocated: 500,
      maxDrawdownPct: 5,
    });
  });
});
