import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAllBotsFromD1, hydrateFromD1 } from './d1-adapter';

// Mock dependencies
vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  findAllBots: vi.fn(),
  findBotsByUser: vi.fn(),
}));

describe('d1-adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadAllBotsFromD1', () => {
    it('returns early when db is null', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await loadAllBotsFromD1();

      expect(createServerClient).toHaveBeenCalled();
    });

    it('loads bots from database', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      const { findAllBots } = await import('@/lib/db/repositories');
      const { getBotManager } = await import('@/tree/bot');

      const mockBot = {
        id: 'bot_123',
        name: 'Test Bot',
        config_json: JSON.stringify({
          pair: 'BTC-USDT',
          exchangeId: 'binance',
        }),
        status: 'running',
        total_trades: 0,
        started_at: null,
        stopped_at: null,
        last_error: null,
        last_tick_at: null,
        last_order_at: null,
        current_drawdown: 0,
        total_pnl: 0,
        win_count: 0,
        loss_count: 0,
        max_drawdown: 0,
      };

      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue({});
      (findAllBots as ReturnType<typeof vi.fn>).mockResolvedValue([mockBot]);

      const mockManager = {
        createBot: vi.fn(),
      };
      (getBotManager as ReturnType<typeof vi.fn>).mockReturnValue(mockManager);

      await loadAllBotsFromD1();

      expect(findAllBots).toHaveBeenCalled();
    });

    it('calls error handler on bot load failure', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      const { findAllBots } = await import('@/lib/db/repositories');

      const mockBot = {
        id: 'bad_bot',
        config_json: 'invalid json',
        status: 'error',
      };

      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue({});
      (findAllBots as ReturnType<typeof vi.fn>).mockResolvedValue([mockBot]);

      const errorHandler = vi.fn();
      await loadAllBotsFromD1(errorHandler);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        'd1-adapter:loadBot:bad_bot',
      );
    });
  });

  describe('hydrateFromD1', () => {
    it('returns early when db is null', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await hydrateFromD1('user_123');

      expect(createServerClient).toHaveBeenCalled();
    });
  });
});
