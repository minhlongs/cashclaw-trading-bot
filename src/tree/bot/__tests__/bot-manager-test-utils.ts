import { vi } from 'vitest';
import type { BotStatus } from '../types';
import type { Bot } from '@/lib/db/types';

export { mockRequest, makeBotRow } from './bot-manager-test-fixtures';

export const mockFindBotById = vi.fn<(...args: unknown[]) => Promise<Bot | null>>(async () => null);
export const mockFindAllBots = vi.fn<(...args: unknown[]) => Promise<Bot[]>>(async () => []);
export const mockFindBotsByUser = vi.fn<(...args: unknown[]) => Promise<Bot[]>>(async () => []);

export function setupMocks() {
  vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  }));

  vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));

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
