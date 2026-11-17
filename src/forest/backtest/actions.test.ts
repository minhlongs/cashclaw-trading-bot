import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBacktestAction, getBacktestResults, type BacktestRunInput, type BacktestRunOutput } from './actions';
import type { VolatilityDcaBotConfig, GridBotConfig } from '@/tree/bot/types';

const mockHeaderMap = new Map<string, string>();
const mockCookieMap = new Map<string, string>();
let inRequestScope = false;

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => {
    if (!inRequestScope) throw new Error('headers was called outside a request scope');
    return { get: (name: string) => mockHeaderMap.get(name.toLowerCase()) ?? null };
  }),
  cookies: vi.fn(async () => {
    if (!inRequestScope) throw new Error('cookies was called outside a request scope');
    return {
      get: (name: string) => {
        const value = mockCookieMap.get(name);
        return value !== undefined ? { name, value } : undefined;
      },
    };
  }),
}));
vi.mock('./data-fetcher', () => ({ fetchOHLCV: vi.fn() }));
vi.mock('./engine', () => ({ runBacktest: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { fetchOHLCV } from './data-fetcher';
import { runBacktest } from './engine';
import { createServerClient } from '@/lib/db/client';

const mockFetch = vi.mocked(fetchOHLCV);
const mockRun = vi.mocked(runBacktest);
const mockDb = vi.mocked(createServerClient);

interface MockD1Fixture {
  sessions?: Record<string, { user_id: string; expires_at: number }>;
  bots?: Record<string, { id: string; user_id: string }>;
  resultsByBot?: Record<string, Array<{ id: string }>>;
}

function resolveAllRows(sql: string, params: unknown[], fixture: MockD1Fixture): unknown[] {
  if (sql.includes('FROM user_sessions')) {
    const row = fixture.sessions?.[String(params[0])];
    return row ? [row] : [];
  }
  if (!sql.includes('FROM backtest_results')) return [];
  const bot = fixture.bots?.[String(params[0])];
  if (!bot || bot.user_id !== String(params[1])) return [];
  return fixture.resultsByBot?.[String(params[0])] ?? [];
}

function setupMockD1(fixture: MockD1Fixture) {
  const mockRunDb = vi.fn().mockResolvedValue({ success: true });
  const mockPrepare = vi.fn((sql: string) => ({
    bind: vi.fn((...params: unknown[]) => ({
      run: mockRunDb,
      first: vi.fn(async () => (sql.includes('FROM bots') ? (fixture.bots?.[String(params[0])] ?? null) : null)),
      all: vi.fn(async () => ({ results: resolveAllRows(sql, params, fixture) })),
    })),
  }));
  mockDb.mockReturnValue({ prepare: mockPrepare } as unknown as ReturnType<typeof createServerClient>);
  return { mockPrepare, mockRunDb };
}

const BASE_INPUT = {
  botId: 'b1', exchange: 'binance', symbol: 'BTC/USDT', strategy: 'grid' as const,
  config: { strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 1000 } as GridBotConfig,
  startDate: new Date('2024-01-01'), endDate: new Date('2024-01-02'), interval: '1h' as const,
};

const BASE_VDCA: VolatilityDcaBotConfig = {
  strategy: 'volatility_dca', symbol: 'BTC/USDT', pair: 'BTC/USDT', exchange: 'binance',
  mode: 'paper', capital: 1000, maxDrawdownPct: 15, priceDropStep: 1,
  maxSteps: 3, baseOrderSizePct: 10, volatilityWindow: 20, volBaseline: 40, reboundTarget: 2,
};

describe('runBacktestAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaderMap.clear();
    mockCookieMap.clear();
    inRequestScope = false;
  });

  it('rejects unsupported intervals', async () => {
    const res = await runBacktestAction({ ...BASE_INPUT, interval: '2h' });
    expect(res).toEqual({ success: false, error: 'Unsupported interval: 2h', candlesFetched: 0 });
  });

  it('rejects invalid date range (endDate <= startDate)', async () => {
    const res = await runBacktestAction({ ...BASE_INPUT, startDate: new Date('2024-01-02'), endDate: new Date('2024-01-01') });
    expect(res).toEqual({ success: false, error: 'endDate must be after startDate', candlesFetched: 0 });
  });

  it('rejects date range exceeding 3 years', async () => {
    const res = await runBacktestAction({ ...BASE_INPUT, startDate: new Date('2020-01-01'), endDate: new Date('2024-01-01') });
    expect(res).toEqual({ success: false, error: 'Date range exceeds 3-year limit', candlesFetched: 0 });
  });

  it('rejects unknown strategy', async () => {
    const res = await runBacktestAction({
      ...BASE_INPUT, strategy: 'magic_ai',
      config: { strategy: 'magic_ai', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 1000 } as unknown as GridBotConfig,
    });
    expect(res).toEqual({ success: false, error: 'Unsupported strategy: magic_ai', candlesFetched: 0 });
  });

  it('validates volatility_dca parameters strictly', async () => {
    const testCases = [
      { key: 'priceDropStep', val: 0, err: 'priceDropStep must be positive' },
      { key: 'maxSteps', val: -1, err: 'maxSteps must be positive' },
      { key: 'volBaseline', val: 0, err: 'volBaseline must be positive' },
      { key: 'baseOrderSizePct', val: 0, err: 'baseOrderSizePct must be positive' },
    ];
    for (const { key, val, err } of testCases) {
      const res = await runBacktestAction({ ...BASE_INPUT, strategy: 'volatility_dca', config: { ...BASE_VDCA, [key]: val } });
      expect(res.error).toBe(err);
    }
  });

  it('runs backtest and persists to D1 on valid input with authenticated session', async () => {
    mockFetch.mockResolvedValue([
      { timestamp: 1000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 10 },
      { timestamp: 2000, open: 50000, high: 50100, low: 49900, close: 50050, volume: 10 },
    ]);
    const mockResult = {
      id: 'bt_123', bot_id: 'b1', strategy: 'volatility_dca', pair: 'BTC/USDT', exchange: 'binance',
      start_date: 1000, end_date: 2000, total_trades: 1, win_count: 1, loss_count: 0,
      win_rate: 100, total_pnl: 50, max_drawdown: 1.5, sharpe_ratio: 2.0, params_json: '{}',
      equity_curve_json: [], trades_json: [], created_at: 3000,
    };
    mockRun.mockReturnValue(mockResult);

    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const { mockPrepare, mockRunDb } = setupMockD1({
      sessions: { sess_user_1: { user_id: 'user_1', expires_at: futureExpiry } },
      bots: { b1: { id: 'b1', user_id: 'user_1' } },
    });
    inRequestScope = true;
    mockCookieMap.set('session_id', 'sess_user_1');

    const res = await runBacktestAction({ ...BASE_INPUT, strategy: 'volatility_dca', config: BASE_VDCA });
    expect(res.success).toBe(true);
    expect(res.result).toEqual(mockResult);
    expect(mockPrepare).toHaveBeenCalled();
    expect(mockRunDb).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated backtest execution and result queries fail-closed', async () => {
    const unauthRun = await runBacktestAction({ ...BASE_INPUT, strategy: 'volatility_dca', config: BASE_VDCA });
    expect(unauthRun).toEqual({ success: false, error: 'Authentication required', candlesFetched: 0 });
    expect(await getBacktestResults('b1')).toEqual([]);
  });

  it('fetches backtest results from D1 scoped to authenticated session owner', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    setupMockD1({
      sessions: { sess_user_1: { user_id: 'user_1', expires_at: futureExpiry } },
      bots: { b1: { id: 'b1', user_id: 'user_1' } },
      resultsByBot: { b1: [{ id: 'bt_1' }] },
    });
    inRequestScope = true;
    mockCookieMap.set('session_id', 'sess_user_1');
    expect(await getBacktestResults('b1')).toEqual([{ id: 'bt_1' }]);
  });

  it('ignores forged extra userId argument for unauthenticated and cross-tenant callers', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    setupMockD1({
      sessions: { sess_attacker: { user_id: 'user_attacker', expires_at: futureExpiry } },
      bots: { b_victim: { id: 'b_victim', user_id: 'user_victim' }, b_attacker: { id: 'b_attacker', user_id: 'user_attacker' } },
      resultsByBot: { b_victim: [{ id: 'bt_victim_secret' }], b_attacker: [{ id: 'bt_attacker_own' }] },
    });
    const invokeRunWithForgedArg = runBacktestAction as unknown as (input: BacktestRunInput, forgedUserId?: string) => Promise<BacktestRunOutput>;
    const invokeGetWithForgedArg = getBacktestResults as unknown as (botId: string, forgedUserId?: string) => Promise<unknown[]>;

    inRequestScope = true;
    const victimInput = { ...BASE_INPUT, botId: 'b_victim', strategy: 'volatility_dca' as const, config: BASE_VDCA };
    expect(await invokeRunWithForgedArg(victimInput, 'user_victim')).toEqual({
      success: false, error: 'Authentication required', candlesFetched: 0,
    });
    expect(await invokeGetWithForgedArg('b_victim', 'user_victim')).toEqual([]);

    mockCookieMap.set('session_id', 'sess_attacker');
    expect(await invokeRunWithForgedArg(victimInput, 'user_victim')).toEqual({
      success: false, error: 'Bot not found: b_victim', candlesFetched: 0,
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
    expect(await invokeGetWithForgedArg('b_victim', 'user_victim')).toEqual([]);
    expect(await getBacktestResults('b_attacker')).toEqual([{ id: 'bt_attacker_own' }]);
  });
});
