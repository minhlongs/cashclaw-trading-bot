import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  findBotsByUser: vi.fn(),
  findAllBots: vi.fn(),
}));

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(),
  resetBotManager: vi.fn(),
}));

const mockedCreateServerClient = vi.mocked((await import('@/lib/db/client')).createServerClient);
const mockedFindBotsByUser = vi.mocked((await import('@/lib/db/repositories')).findBotsByUser);
const mockedFindAllBots = vi.mocked((await import('@/lib/db/repositories')).findAllBots);
const mockedGetBotManager = vi.mocked((await import('@/tree/bot')).getBotManager);

function createBotLike() {
  return {
    getSnapshot: vi.fn().mockReturnValue({ id: 'existing', status: 'idle' }),
    patchState: vi.fn(),
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bot_1',
    user_id: 'user_1',
    config_json: JSON.stringify({
      strategy: 'grid',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      capital: 500,
      gridSpacingPct: 1,
      gridLevels: 4,
    }),
    total_trades: 10,
    started_at: 1000,
    stopped_at: null,
    last_error: null,
    last_tick_at: 900,
    last_order_at: 800,
    current_drawdown: 0.5,
    total_pnl: 12,
    win_count: 4,
    loss_count: 3,
    max_drawdown: 1.2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreateServerClient.mockReset();
  mockedFindBotsByUser.mockReset();
  mockedFindAllBots.mockReset();
  mockedGetBotManager.mockReset();

  const manager = createBotLike();
  mockedGetBotManager.mockReturnValue(manager as any);
});

describe('d1-hydration', () => {
  describe('hydrateFromD1', () => {
    it('returns early when db client is null', async () => {
      const { hydrateFromD1 } = await import('./d1-hydration');
      mockedCreateServerClient.mockReturnValue(null);

      await hydrateFromD1('user_1');

      expect(mockedFindBotsByUser).not.toHaveBeenCalled();
    });

    it('creates bot and restores state from valid row', async () => {
      const { hydrateFromD1 } = await import('./d1-hydration');
      const bot = createBotLike();
      const manager = { createBot: vi.fn().mockResolvedValue(bot) };
      mockedGetBotManager.mockReturnValue(manager as any);
      mockedCreateServerClient.mockReturnValue({} as any);
      mockedFindBotsByUser.mockResolvedValue([makeRow()] as any);

      await hydrateFromD1('user_1');

      expect(manager.createBot).toHaveBeenCalledTimes(1);
      expect(bot.patchState).toHaveBeenCalledWith(
        expect.objectContaining({
          totalTrades: 10,
          startedAt: 1000,
          totalPnl: 12,
          winCount: 4,
          lossCount: 3,
          maxDrawdown: 1.2,
          currentDrawdown: 0.5,
          lastTickAt: 900,
          lastOrderAt: 800,
        }),
      );
    });

    it('calls onError when bot creation throws', async () => {
      const { hydrateFromD1 } = await import('./d1-hydration');
      const onError = vi.fn();
      const manager = { createBot: vi.fn().mockRejectedValue(new Error('create failed')) };
      mockedGetBotManager.mockReturnValue(manager as any);
      mockedCreateServerClient.mockReturnValue({} as any);
      mockedFindBotsByUser.mockResolvedValue([makeRow()] as any);

      await hydrateFromD1('user_1', onError);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe('create failed');
      expect(onError.mock.calls[0][1]).toBe('d1-adapter:hydrateBot:bot_1');
    });

    it('calls onError when config_json is malformed', async () => {
      const { hydrateFromD1 } = await import('./d1-hydration');
      const onError = vi.fn();
      const manager = { createBot: vi.fn() };
      mockedGetBotManager.mockReturnValue(manager as any);
      mockedCreateServerClient.mockReturnValue({} as any);
      mockedFindBotsByUser.mockResolvedValue([makeRow({ config_json: '{bad' })] as any);

      await hydrateFromD1('user_1', onError);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(manager.createBot).not.toHaveBeenCalled();
    });

    it('restores last_error when present', async () => {
      const { hydrateFromD1 } = await import('./d1-hydration');
      const bot = createBotLike();
      const manager = { createBot: vi.fn().mockResolvedValue(bot) };
      mockedGetBotManager.mockReturnValue(manager as any);
      mockedCreateServerClient.mockReturnValue({} as any);
      mockedFindBotsByUser.mockResolvedValue([makeRow({ last_error: 'tick failed' })] as any);

      await hydrateFromD1('user_1');

      expect(bot.patchState).toHaveBeenCalledWith(expect.objectContaining({ error: 'tick failed' }));
    });
  });

  describe('loadAllBotsFromD1', () => {
    it('skips already hydrated bot IDs', async () => {
      const { loadAllBotsFromD1 } = await import('./d1-hydration');
      const bot = createBotLike();
      const manager = { createBot: vi.fn().mockResolvedValue(bot) };
      mockedGetBotManager.mockReturnValue(manager as any);
      mockedCreateServerClient.mockReturnValue({} as any);
      mockedFindAllBots.mockResolvedValue([makeRow()] as any);

      await loadAllBotsFromD1();
      await loadAllBotsFromD1();

      expect(manager.createBot).toHaveBeenCalledTimes(1);
    });

    it('returns early when db client is null', async () => {
      const { loadAllBotsFromD1 } = await import('./d1-hydration');
      const manager = { createBot: vi.fn() };
      mockedGetBotManager.mockReturnValue(manager as any);
      mockedCreateServerClient.mockReturnValue(null);

      await loadAllBotsFromD1();

      expect(mockedFindAllBots).not.toHaveBeenCalled();
      expect(manager.createBot).not.toHaveBeenCalled();
    });

    it('calls onError when restore fails and continues', async () => {
      const { loadAllBotsFromD1 } = await import('./d1-hydration');
      const onError = vi.fn();
      const manager = {
        createBot: vi
          .fn()
          .mockRejectedValueOnce(new Error('bad row'))
          .mockResolvedValueOnce(createBotLike()),
      };
      mockedGetBotManager.mockReturnValue(manager as any);
      mockedCreateServerClient.mockReturnValue({} as any);
      mockedFindAllBots.mockResolvedValue([makeRow({ id: 'a1' }), makeRow({ id: 'a2' })] as any);

      await loadAllBotsFromD1(onError);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][1]).toBe('d1-adapter:loadBot:a1');
      expect(manager.createBot).toHaveBeenCalledTimes(2);
    });
  });
});
