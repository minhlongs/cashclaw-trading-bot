import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotInstance } from '@/tree/bot/bot-instance';
import type { BotConfig, BotState } from '@/tree/bot/types';
import type { TradeEvent } from '@/tree/telemetry';

const mockGetAllBots = vi.fn<() => BotInstance[]>();
const mockGetRecentEvents = vi.fn<() => Promise<TradeEvent[]>>();

vi.mock('@/tree/bot', () => ({
  getBotManager: () => ({ getAllBots: mockGetAllBots }),
}));
vi.mock('@/forest/bot/d1-adapter', () => ({ loadAllBotsFromD1: vi.fn() }));
vi.mock('@/tree/bot/bot-instance', () => ({ BotInstance: class {} }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./trade-events', () => ({ getRecentEvents: mockGetRecentEvents }));

const baseConfig: BotConfig = {
  strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance',
  mode: 'live', capital: 1000, maxDrawdownPct: 10,
  gridSpacingPct: 1, gridLevels: 10, capitalPerLevelPct: 10,
  takeProfitPct: 2, stopLossPct: 3, rebalanceOnFill: false,
} as BotConfig;

function snap(overrides: Partial<BotState> = {}): BotState {
  const now = Date.now();
  return {
    id: 'bot-1', config: { ...baseConfig }, status: 'idle', createdAt: now,
    startedAt: null, error: null, totalPnl: 0, totalTrades: 0,
    winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0,
    stoppedAt: null, lastTickAt: null, lastOrderAt: null, updatedAt: now,
    ...overrides,
  };
}

function bot(snapOverrides: Partial<BotState> = {}, cfgOverrides: Partial<BotConfig> = {}): BotInstance {
  const cfg = { ...baseConfig, ...cfgOverrides } as BotConfig;
  const s = snap({ config: cfg, ...snapOverrides });
  return { getSnapshot: () => s, getConfig: () => cfg } as unknown as BotInstance;
}

describe('getKpis', () => {
  let getKpis: typeof import('./bot-kpis').getKpis;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetRecentEvents.mockResolvedValue([]);
    getKpis = (await import('./bot-kpis')).getKpis;
  });

  it('returns zeros for empty bot list', async () => {
    mockGetAllBots.mockReturnValue([]);
    const r = await getKpis();
    expect(r.totalBalance).toBe(0);
    expect(r.todayPnl).toBe(0);
    expect(r.activeBots).toBe(0);
    expect(r.totalTrades).toBe(0);
    expect(r.winRate).toBe(0);
  });

  it('counts only running bots as active', async () => {
    mockGetAllBots.mockReturnValue([
      bot({ status: 'running' }),
      bot({ id: 'b2', status: 'idle' }),
      bot({ id: 'b3', status: 'running' }),
    ]);
    expect((await getKpis()).activeBots).toBe(2);
  });

  it('calculates totalBalance = capital + totalPnl per bot', async () => {
    mockGetAllBots.mockReturnValue([
      bot({ totalPnl: 150 }, { capital: 1000 }),
      bot({ id: 'b2', totalPnl: -50 }, { capital: 500 }),
    ]);
    expect((await getKpis()).totalBalance).toBe(1600);
  });

  it('sums todayPnl only for bots started today', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    mockGetAllBots.mockReturnValue([
      bot({ startedAt: todayStart.getTime(), totalPnl: 100 }),
      bot({ id: 'b2', startedAt: null, totalPnl: 50 }),
    ]);
    expect((await getKpis()).todayPnl).toBe(100);
  });

  it('computes winRate from totalTrades and winCount', async () => {
    mockGetAllBots.mockReturnValue([
      bot({ totalTrades: 10, winCount: 7 }),
      bot({ id: 'b2', totalTrades: 5, winCount: 3 }),
    ]);
    const r = await getKpis();
    expect(r.totalTrades).toBe(15);
    expect(r.winRate).toBe(67);
  });

  it('winRate is 0 when no trades exist', async () => {
    mockGetAllBots.mockReturnValue([bot()]);
    const r = await getKpis();
    expect(r.winRate).toBe(0);
    expect(r.totalTrades).toBe(0);
  });

  it('stopped/error/paused bots count as inactive', async () => {
    mockGetAllBots.mockReturnValue([
      bot({ status: 'stopped' }),
      bot({ id: 'b2', status: 'error' }),
      bot({ id: 'b3', status: 'paused' }),
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
    mockGetAllBots.mockReturnValue([]);
    const r = await getDashboardData();
    expect(r.kpis.totalBalance).toBe(0);
    expect(r.bots).toEqual([]);
    expect(r.recentEvents).toEqual([]);
  });

  it('returns card data and KPIs for populated bots', async () => {
    mockGetAllBots.mockReturnValue([
      bot(
        { id: 'grid-1', totalPnl: 100, totalTrades: 6, winCount: 5 },
        { strategy: 'grid', symbol: 'SOL/USDT', exchange: 'okx', capital: 2000 },
      ),
    ]);
    mockGetRecentEvents.mockResolvedValue([
      { id: 'e1', botId: 'grid-1', eventType: 'fill', details: {}, timestamp: Date.now() },
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
    mockGetAllBots.mockReturnValue([bot({}, { exchange: undefined })]);
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
    mockGetAllBots.mockReturnValue([]);
    expect(await getBotCards()).toEqual([]);
  });

  it('maps snapshots to card data correctly', async () => {
    mockGetAllBots.mockReturnValue([
      bot(
        { id: 'mr-1', status: 'running', startedAt: 1000, totalPnl: 50,
          winCount: 2, lossCount: 1, maxDrawdown: 5, updatedAt: 2000 },
        { strategy: 'mean_reversion' as const, symbol: 'ETH/USDT', capital: 500 },
      ),
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
