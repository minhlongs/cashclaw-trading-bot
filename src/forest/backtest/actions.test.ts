import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacktestResult } from './engine';
import type { Candle } from './ohlcv';
import type { BotConfig } from '@/tree/bot/types';
import type { BacktestResultRow } from '@/lib/db/types';

vi.mock('./data-fetcher', () => ({
  fetchOHLCV: vi.fn(),
}));

vi.mock('./engine', () => ({
  runBacktest: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { runBacktestAction, getBacktestResults, type BacktestRunInput } from './actions';
import { fetchOHLCV } from './data-fetcher';
import { runBacktest } from './engine';
import { createServerClient } from '@/lib/db/client';

const mockFetchOHLCV = vi.mocked(fetchOHLCV);
const mockRunBacktest = vi.mocked(runBacktest);
const mockCreateServerClient = vi.mocked(createServerClient);

function makeCandles(n: number): Candle[] {
  const base = 1700000000000;
  return Array.from({ length: n }, (_, i) => ({
    timestamp: base + i * 3_600_000,
    open: 100, high: 110, low: 90, close: 105, volume: 1000,
  }));
}

function makeResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    id: 'bt-1', bot_id: 'bot-1', strategy: 'grid', pair: 'BTC/USDT',
    exchange: 'binance', start_date: 1700000000000, end_date: 1700100000000,
    total_trades: 10, win_count: 6, loss_count: 4, win_rate: 60,
    total_pnl: 500, max_drawdown: 5, sharpe_ratio: 1.5,
    params_json: '{}', equity_curve_json: [], trades_json: [],
    created_at: Date.now(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<BacktestRunInput> = {}): BacktestRunInput {
  return {
    botId: 'bot-1', exchange: 'binance', symbol: 'BTC/USDT', strategy: 'grid',
    config: { id: 'bot-1', strategy: 'grid', capital: 1000 } as unknown as BotConfig,
    startDate: new Date('2024-01-01'), endDate: new Date('2024-02-01'),
    ...overrides,
  };
}

function makeDb() {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1, last_row_id: 1, duration: 10 } }),
    all: vi.fn().mockResolvedValue({ results: [] as BacktestResultRow[], meta: { duration: 10 } }),
  };
  return { prepare: vi.fn().mockReturnValue(stmt) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOHLCV.mockResolvedValue(makeCandles(10));
  mockRunBacktest.mockReturnValue(makeResult());
  mockCreateServerClient.mockReturnValue(null);
});

describe('runBacktestAction', () => {
  it('rejects unsupported interval', async () => {
    const out = await runBacktestAction(makeInput({ interval: '2h' }));
    expect(out.success).toBe(false);
    expect(out.error).toContain('Unsupported interval');
    expect(out.candlesFetched).toBe(0);
  });

  it('accepts all supported intervals', async () => {
    for (const iv of ['1m', '5m', '15m', '1h', '4h', '1d'] as const) {
      const out = await runBacktestAction(makeInput({ interval: iv }));
      expect(out.success).toBe(true);
    }
  });

  it('defaults to 1h interval when not specified', async () => {
    const input = makeInput();
    delete input.interval;
    const out = await runBacktestAction(input);
    expect(out.success).toBe(true);
    expect(mockFetchOHLCV).toHaveBeenCalledWith(
      'binance', 'BTC/USDT', '1h',
      expect.any(Number), expect.any(Number),
    );
  });

  it('rejects endDate before startDate', async () => {
    const out = await runBacktestAction(makeInput({
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-01-01'),
    }));
    expect(out.success).toBe(false);
    expect(out.error).toBe('endDate must be after startDate');
  });

  it('rejects endDate equal to startDate', async () => {
    const same = new Date('2024-01-01');
    const out = await runBacktestAction(makeInput({ startDate: same, endDate: same }));
    expect(out.success).toBe(false);
    expect(out.error).toBe('endDate must be after startDate');
  });

  it('rejects date range exceeding 3 years', async () => {
    const out = await runBacktestAction(makeInput({
      startDate: new Date('2020-01-01'),
      endDate: new Date('2024-01-01'),
    }));
    expect(out.success).toBe(false);
    expect(out.error).toContain('3-year limit');
  });

  it('handles fetchOHLCV error', async () => {
    mockFetchOHLCV.mockRejectedValueOnce(new Error('Network timeout'));
    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(false);
    expect(out.error).toBe('Network timeout');
    expect(out.candlesFetched).toBe(0);
  });

  it('handles non-Error fetchOHLCV rejection', async () => {
    mockFetchOHLCV.mockRejectedValueOnce('string error');
    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(false);
    expect(out.error).toBe('Failed to fetch OHLCV data');
  });

  it('rejects insufficient candles (0)', async () => {
    mockFetchOHLCV.mockResolvedValueOnce([]);
    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(false);
    expect(out.error).toContain('Insufficient data');
    expect(out.candlesFetched).toBe(0);
  });

  it('rejects insufficient candles (1)', async () => {
    mockFetchOHLCV.mockResolvedValueOnce(makeCandles(1));
    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(false);
    expect(out.candlesFetched).toBe(1);
  });

  it('returns success with result on valid run', async () => {
    const expected = makeResult();
    mockRunBacktest.mockReturnValueOnce(expected);
    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(true);
    expect(out.result).toBe(expected);
    expect(out.candlesFetched).toBe(10);
  });

  it('handles runBacktest throwing Error', async () => {
    mockRunBacktest.mockImplementationOnce(() => { throw new Error('Engine crash'); });
    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(false);
    expect(out.error).toBe('Engine crash');
    expect(out.candlesFetched).toBe(10);
  });

  it('handles runBacktest throwing non-Error', async () => {
    mockRunBacktest.mockImplementationOnce(() => { throw 42; });
    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(false);
    expect(out.error).toBe('Backtest engine failed');
  });

  it('passes feePct/slippagePct/initialCapital to engine', async () => {
    await runBacktestAction(makeInput({ feePct: 0.5, slippagePct: 0.1, initialCapital: 5000 }));
    expect(mockRunBacktest).toHaveBeenCalledWith(expect.objectContaining({
      feePct: 0.5, slippagePct: 0.1, initialCapital: 5000,
    }));
  });

  it('uses config.capital as initialCapital fallback', async () => {
    await runBacktestAction(makeInput());
    expect(mockRunBacktest).toHaveBeenCalledWith(expect.objectContaining({
      initialCapital: 1000,
    }));
  });
});

describe('runBacktestAction — D1 persistence', () => {
  it('persists result when DB is available', async () => {
    const db = makeDb();
    mockCreateServerClient.mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);
    const result = makeResult();
    mockRunBacktest.mockReturnValueOnce(result);

    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(true);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO backtest_results'));
    expect(db.prepare).toHaveBeenCalledOnce();
  });

  it('skips persistence when DB is null', async () => {
    mockCreateServerClient.mockReturnValue(null);
    await runBacktestAction(makeInput());
    expect(mockCreateServerClient).toHaveBeenCalled();
  });

  it('returns success even when DB insert fails', async () => {
    const stmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockRejectedValueOnce(new Error('D1 write failed')),
    };
    const db = { prepare: vi.fn().mockReturnValue(stmt) };
    mockCreateServerClient.mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);
    mockRunBacktest.mockReturnValueOnce(makeResult());

    const out = await runBacktestAction(makeInput());
    expect(out.success).toBe(true);
  });
});

describe('getBacktestResults', () => {
  it('returns empty array when DB is null', async () => {
    mockCreateServerClient.mockReturnValue(null);
    const results = await getBacktestResults('bot-1');
    expect(results).toEqual([]);
  });

  it('returns results from DB', async () => {
    const rows: BacktestResultRow[] = [
      { id: 'r1', bot_id: 'bot-1', strategy: 'grid', pair: 'BTC/USDT',
        exchange: 'binance', start_date: 0, end_date: 0, total_trades: 5,
        win_count: 3, loss_count: 2, win_rate: 60, total_pnl: 100,
        max_drawdown: 2, sharpe_ratio: 1.0, params_json: '{}',
        equity_curve_json: '[]', created_at: 0 },
    ];
    const stmt = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: rows, meta: { duration: 10 } }),
    };
    const db = { prepare: vi.fn().mockReturnValue(stmt) };
    mockCreateServerClient.mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);

    const results = await getBacktestResults('bot-1');
    expect(results).toEqual(rows);
    expect(stmt.bind).toHaveBeenCalledWith('bot-1');
  });

  it('returns empty array on DB error', async () => {
    const stmt = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockRejectedValueOnce(new Error('D1 read failed')),
    };
    const db = { prepare: vi.fn().mockReturnValue(stmt) };
    mockCreateServerClient.mockReturnValue(db as unknown as ReturnType<typeof createServerClient>);

    const results = await getBacktestResults('bot-1');
    expect(results).toEqual([]);
  });
});
