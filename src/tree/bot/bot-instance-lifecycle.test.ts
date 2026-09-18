import { describe, it, expect, vi } from 'vitest';
import { fetchStartPrice, startBotLifecycle, type StartLifecycleContext } from './bot-instance-lifecycle';
import type { ExchangeAdapter, Ticker } from '../exchange/types';
import type { ExchangeOrchestrator } from '@/land/exchange-orchestration';
import type { BotConfig, BotDependencies, BotState } from './types';
import type { Killswitch } from './killswitch';
import { createInitialState } from './bot-state';

const SYMBOL = 'BTC/USDT';

function makeMockTicker(overrides: Partial<Ticker> = {}): Ticker {
  return {
    symbol: SYMBOL,
    last: 50000,
    bid: 49950,
    ask: 50050,
    high24h: 52000,
    low24h: 48000,
    volume24h: 1000,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('bot-instance-lifecycle', () => {
  describe('fetchStartPrice', () => {
    it('fetches price via exchangeOrchestrator when available', async () => {
      const mockOrchestrator = {
        fetchTicker: vi.fn().mockResolvedValue({
          ok: true,
          data: makeMockTicker({ last: 52000 }),
        }),
      } as unknown as ExchangeOrchestrator;

      const deps: BotDependencies = {
        exchange: {} as ExchangeAdapter,
        killswitch: {} as Killswitch,
        exchangeOrchestrator: mockOrchestrator,
      };

      const price = await fetchStartPrice(deps, SYMBOL);
      expect(price).toBe(52000);
      expect(mockOrchestrator.fetchTicker).toHaveBeenCalledWith('paper', SYMBOL);
    });

    it('throws when exchangeOrchestrator returns ok: false', async () => {
      const mockOrchestrator = {
        fetchTicker: vi.fn().mockResolvedValue({
          ok: false,
          error: 'Network timeout',
        }),
      } as unknown as ExchangeOrchestrator;

      const deps: BotDependencies = {
        exchange: {} as ExchangeAdapter,
        killswitch: {} as Killswitch,
        exchangeOrchestrator: mockOrchestrator,
      };

      await expect(fetchStartPrice(deps, SYMBOL)).rejects.toThrow(`Failed to fetch ticker for ${SYMBOL}`);
    });

    it('fetches price via direct exchange adapter when orchestrator is absent', async () => {
      const mockExchange = {
        fetchTicker: vi.fn().mockResolvedValue(makeMockTicker({ last: 48500 })),
      } as unknown as ExchangeAdapter;

      const deps: BotDependencies = {
        exchange: mockExchange,
        killswitch: {} as Killswitch,
      };

      const price = await fetchStartPrice(deps, SYMBOL);
      expect(price).toBe(48500);
      expect(mockExchange.fetchTicker).toHaveBeenCalledWith(SYMBOL);
    });

    it('throws when direct exchange returns null ticker', async () => {
      const mockExchange = {
        fetchTicker: vi.fn().mockResolvedValue(null),
      } as unknown as ExchangeAdapter;

      const deps: BotDependencies = {
        exchange: mockExchange,
        killswitch: {} as Killswitch,
      };

      await expect(fetchStartPrice(deps, SYMBOL)).rejects.toThrow(`Failed to fetch ticker for ${SYMBOL}`);
    });

    it('throws when ticker price <= 0', async () => {
      const mockExchange = {
        fetchTicker: vi.fn().mockResolvedValue(makeMockTicker({ last: 0 })),
      } as unknown as ExchangeAdapter;

      const deps: BotDependencies = {
        exchange: mockExchange,
        killswitch: {} as Killswitch,
      };

      await expect(fetchStartPrice(deps, SYMBOL)).rejects.toThrow(`Invalid price for ${SYMBOL}: 0`);
    });
  });

  describe('startBotLifecycle', () => {
    it('returns null strategy if bot is already running', async () => {
      const config = { symbol: SYMBOL, strategy: 'grid' } as BotConfig;
      const state: BotState = {
        ...createInitialState('bot-1', config),
        status: 'running',
        startedAt: Date.now(),
      };

      const ctx: StartLifecycleContext = {
        id: 'bot-1',
        config,
        deps: { exchange: {} as ExchangeAdapter, killswitch: {} as Killswitch },
        callbacks: { onStateChange: vi.fn(), onTrade: vi.fn(), onLog: vi.fn(), onError: vi.fn() },
        state,
        placeOrder: vi.fn(),
        emitTelemetry: vi.fn(),
        emitState: vi.fn(),
        startTicking: vi.fn(),
      };

      const res = await startBotLifecycle(ctx);
      expect(res.strategy).toBeNull();
      expect(res.strategyChain).toBeNull();
    });

    it('handles non-Error thrown during lifecycle', async () => {
      const mockExchange = {
        fetchTicker: vi.fn().mockRejectedValue('String error in lifecycle'),
      } as unknown as ExchangeAdapter;

      const config = { symbol: SYMBOL, strategy: 'grid' } as BotConfig;
      const state: BotState = createInitialState('bot-2', config);

      const onError = vi.fn();
      const emitTelemetry = vi.fn();
      const emitState = vi.fn();

      const ctx: StartLifecycleContext = {
        id: 'bot-2',
        config,
        deps: { exchange: mockExchange, killswitch: {} as Killswitch },
        callbacks: { onStateChange: vi.fn(), onTrade: vi.fn(), onLog: vi.fn(), onError },
        state,
        placeOrder: vi.fn(),
        emitTelemetry,
        emitState,
        startTicking: vi.fn(),
      };

      const res = await startBotLifecycle(ctx);
      expect(res.strategy).toBeNull();
      expect(state.status).toBe('error');
      expect(state.error).toBe('String error in lifecycle');
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'bot.start');
      expect(emitTelemetry).toHaveBeenCalledWith('error', { error: 'String error in lifecycle', context: 'bot.start' });
      expect(emitState).toHaveBeenCalled();
    });
  });
});
