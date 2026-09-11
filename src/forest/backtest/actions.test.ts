import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBacktestAction, getBacktestResults } from './actions';
import type { VolatilityDcaBotConfig, GridBotConfig } from '@/tree/bot/types';

vi.mock('./data-fetcher', () => ({ fetchOHLCV: vi.fn() }));
vi.mock('./engine', () => ({ runBacktest: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { fetchOHLCV } from './data-fetcher';
import { runBacktest } from './engine';
import { createServerClient } from '@/lib/db/client';

const mockFetch = vi.mocked(fetchOHLCV);
const mockRun = vi.mocked(runBacktest);
const mockDb = vi.mocked(createServerClient);

const BASE_INPUT = {
  botId: 'b1', exchange: 'binance', symbol: 'BTC/USDT',
  strategy: 'grid' as const,
  config: { strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 1000 } as GridBotConfig,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-02'),
  interval: '1h' as const,
};

const BASE_VDCA: VolatilityDcaBotConfig = {
  strategy: 'volatility_dca', symbol: 'BTC/USDT', pair: 'BTC/USDT', exchange: 'binance',
  mode: 'paper', capital: 1000, maxDrawdownPct: 15, priceDropStep: 1,
  maxSteps: 3, baseOrderSizePct: 10, volatilityWindow: 20, volBaseline: 40, reboundTarget: 2,
};

describe('runBacktestAction', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects unsupported intervals', async () => {
    const res = await runBacktestAction({ ...BASE_INPUT, interval: '2h' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unsupported interval: 2h');
  });

  it('rejects invalid date range (endDate <= startDate)', async () => {
    const res = await runBacktestAction({
      ...BASE_INPUT,
      startDate: new Date('2024-01-02'),
      endDate: new Date('2024-01-01'),
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('endDate must be after startDate');
  });

  it('rejects date range exceeding 3 years', async () => {
    const res = await runBacktestAction({
      ...BASE_INPUT,
      startDate: new Date('2020-01-01'),
      endDate: new Date('2024-01-01'),
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Date range exceeds 3-year limit');
  });

  it('rejects unknown strategy', async () => {
    const res = await runBacktestAction({
      ...BASE_INPUT,
      strategy: 'magic_ai',
      config: { strategy: 'magic_ai', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 1000 } as unknown as GridBotConfig,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unsupported strategy: magic_ai');
  });

  it('validates volatility_dca parameters strictly', async () => {
    const testCases = [
      { key: 'priceDropStep', val: 0, err: 'priceDropStep must be positive' },
      { key: 'maxSteps', val: -1, err: 'maxSteps must be positive' },
      { key: 'volBaseline', val: 0, err: 'volBaseline must be positive' },
      { key: 'baseOrderSizePct', val: 0, err: 'baseOrderSizePct must be positive' },
    ];
    for (const { key, val, err } of testCases) {
      const res = await runBacktestAction({
        ...BASE_INPUT,
        strategy: 'volatility_dca',
        config: { ...BASE_VDCA, [key]: val },
      });
      expect(res.error).toBe(err);
    }
  });

  it('runs backtest and persists to D1 on valid input', async () => {
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

    const mockRunDb = vi.fn().mockResolvedValue({ success: true });
    const mockBind = vi.fn().mockReturnValue({ run: mockRunDb });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    mockDb.mockReturnValue({ prepare: mockPrepare } as unknown as ReturnType<typeof createServerClient>);

    const res = await runBacktestAction({
      ...BASE_INPUT,
      strategy: 'volatility_dca',
      config: BASE_VDCA,
    });
    expect(res.success).toBe(true);
    expect(res.result).toEqual(mockResult);
    expect(mockPrepare).toHaveBeenCalled();
  });

  it('fetches backtest results from D1', async () => {
    const mockAll = vi.fn().mockResolvedValue({ results: [{ id: 'bt_1' }] });
    const mockBind = vi.fn().mockReturnValue({ all: mockAll });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    mockDb.mockReturnValue({ prepare: mockPrepare } as unknown as ReturnType<typeof createServerClient>);

    const res = await getBacktestResults('b1');
    expect(res).toEqual([{ id: 'bt_1' }]);
  });
});
