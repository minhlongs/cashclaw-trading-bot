import { vi } from 'vitest';
import type { BotStatus } from '../types';
import type { Bot } from '@/lib/db/types';

export const mockFindBotById = vi.fn<(...args: unknown[]) => Promise<Bot | null>>(async () => null);
export const mockFindAllBots = vi.fn<(...args: unknown[]) => Promise<Bot[]>>(async () => []);
export const mockFindBotsByUser = vi.fn<(...args: unknown[]) => Promise<Bot[]>>(async () => []);

export function setupMocks() {
  vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }));

  vi.mock('@/lib/db/client', () => ({
    createServerClient: vi.fn(),
  }));

  vi.mock('@/lib/db/repositories', () => ({
    findBotById: (db: unknown, id: string) => mockFindBotById(db, id),
    findAllBots: (db: unknown) => mockFindAllBots(db),
    findBotsByUser: (db: unknown, userId: string) => mockFindBotsByUser(db, userId),
  }));

  vi.mock('@/forest/bot/d1-adapter', () => ({
    hydrateFromD1: vi.fn(async () => {}),
    patchBot: vi.fn(async () => {}),
  }));

  vi.mock('@/forest/bot/d1-hydration', () => ({
    restoreBotStateFromRow: vi.fn(),
    toBotStatus: vi.fn((s: string) =>
      s === 'paper_test' || s === 'live_running' ? 'running' : 'idle'
    ),
  }));

  vi.mock('../bot-manager-helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../bot-manager-helpers')>();
    return {
      ...actual,
      createD1Callbacks: vi.fn(() => ({
        onStateChange: vi.fn(),
        onTrade: vi.fn(),
        onLog: vi.fn(),
        onError: vi.fn(),
      })),
      persistNewBot: vi.fn(async () => {}),
      patchBot: vi.fn(async () => {}),
    };
  });

  vi.mock('../paper-adapter', () => ({
    createPaperAdapter: vi.fn(() => ({
      fetchTicker: vi.fn(async () => ({ last: 50000, symbol: 'BTC/USDT' })),
      placeOrder: vi.fn(async () => ({ id: 'mock-order', status: 'filled' })),
      cancelOrder: vi.fn(async () => true),
      fetchBalance: vi.fn(async () => ({ free: { USDT: 10000 } })),
      fetchOpenOrders: vi.fn(async () => []),
    })),
  }));

  vi.mock('../bot-instance', () => {
    let callCount = 0;
    return {
      BotInstance: vi.fn().mockImplementation((id: string) => {
        callCount++;
        const mockId = id || `bot-${callCount}`;
        return {
          id: mockId,
          getSnapshot: vi.fn(() => ({
            status: 'idle' as BotStatus,
            totalPnl: 0,
            symbol: 'BTC/USDT',
            strategy: 'grid',
          })),
          getConfig: vi.fn(() => ({
            symbol: 'BTC/USDT',
            strategy: 'grid',
            capital: 1000,
            intervals: { checkIntervalMs: 60_000 },
          })),
          start: vi.fn(async () => {}),
          stop: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          destroy: vi.fn(),
        };
      }),
    };
  });
}

export function mockRequest(id: string) {
  return {
    id,
    config: {
      symbol: 'BTC/USDT',
      strategy: 'grid' as const,
      capital: 1000,
      gridSpacingPct: 1,
      gridLevels: 4,
      capitalPerLevelPct: 25,
      takeProfitPct: 2,
      stopLossPct: 3,
      rebalanceOnFill: false,
      maxDrawdownPct: 15,
      exchange: 'binance',
      mode: 'paper' as const,
    },
    exchangeConfig: {
      apiKey: 'test',
      apiSecret: 'secret',
      testnet: false,
      sandbox: false,
      rateLimitMs: 1000,
    },
    mode: 'paper' as const,
  };
}

export function makeBotRow(overrides: Partial<Bot> = {}): Bot {
  return {
    id: 'd1-bot-1',
    user_id: 'user-1',
    name: 'D1 Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    status: 'paper_test',
    capital_allocated: 1000,
    capital_used: 0,
    config_json: JSON.stringify({
      strategy: 'grid',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 1000,
      maxDrawdownPct: 15,
    }),
    total_pnl: 0,
    total_trades: 0,
    win_count: 0,
    loss_count: 0,
    max_drawdown: 0,
    started_at: null,
    stopped_at: null,
    last_error: null,
    last_tick_at: null,
    last_order_at: null,
    current_drawdown: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}
