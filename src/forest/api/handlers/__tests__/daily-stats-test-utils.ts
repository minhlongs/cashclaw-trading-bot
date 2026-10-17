import { vi } from 'vitest';

export const mockSnapAll = vi.fn();
export const mockTradeAll = vi.fn();
export const preparedCalls: string[] = [];

export const mockBind = vi.fn().mockImplementation(function (this: { _isSnap?: boolean }, ..._args: unknown[]) {
  return {
    all: this._isSnap ? mockSnapAll : mockTradeAll,
  };
});

export const mockPrepare = vi.fn().mockImplementation(function (this: unknown, sql: string) {
  preparedCalls.push(sql);
  const isSnap = sql.includes('capital_snapshots');
  return {
    _isSnap: isSnap,
    bind: mockBind.bind({ _isSnap: isSnap }),
  };
});

export function setupDailyStatsMocks() {
  vi.mock('@/lib/db/client', () => ({
    createServerClient: vi.fn().mockReturnValue(null),
  }));

  vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn().mockReturnValue({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  }));
}

export function resetDailyStatsMocks() {
  vi.clearAllMocks();
  preparedCalls.length = 0;

  mockPrepare.mockImplementation(function (this: unknown, sql: string) {
    preparedCalls.push(sql);
    const isSnap = sql.includes('capital_snapshots');
    return {
      _isSnap: isSnap,
      bind: mockBind.bind({ _isSnap: isSnap }),
    };
  });

  mockBind.mockImplementation(function (this: { _isSnap?: boolean }, ..._args: unknown[]) {
    return {
      all: this._isSnap ? mockSnapAll : mockTradeAll,
    };
  });

  mockSnapAll.mockResolvedValue({ results: [] });
  mockTradeAll.mockResolvedValue({ results: [] });
}

export function snapRow(overrides: Record<string, unknown> = {}) {
  return {
    bot_id: 'bot-1',
    total_capital: 1000,
    realized_pnl: 50,
    max_drawdown_pct: 3.5,
    ...overrides,
  };
}

export function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    bot_id: 'bot-1',
    event_type: 'TRADE_FILLED',
    detail_json: '{"pnl":10,"strategy":"grid"}',
    created_at: Date.now(),
    ...overrides,
  };
}
