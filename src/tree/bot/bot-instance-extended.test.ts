// Extended tests: resume() lines 113-120, placeOrder() lines 166-181
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotInstance } from './bot-instance';
import type { GridBotConfig } from './types';
import type { ExchangeAdapter, Ticker, OrderRequest, OrderResult } from '../exchange/types';
import type { Killswitch } from './killswitch';
import type { TelemetryWriter } from '../telemetry/writer';

vi.mock('./bot-order-executor', () => ({
  executeOrder: vi.fn().mockResolvedValue({
    result: {
      id: 'ord-1', exchangeId: 'ex-1', symbol: 'BTC/USDT', side: 'buy',
      type: 'market', price: 50000, quantity: 0.01, filled: 0.01,
      status: 'filled', timestamp: Date.now(), pnl: 25,
    } satisfies OrderResult,
    orderCounter: 1,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const SYMBOL = 'BTC/USDT';
const BOT_ID = 'ext-bot-001';

function mockTicker(overrides: Partial<Ticker> = {}): Ticker {
  return {
    symbol: SYMBOL, last: 50000, bid: 49950, ask: 50050,
    high24h: 51000, low24h: 49000, volume24h: 100, timestamp: Date.now(),
    ...overrides,
  };
}

function mockExchange(): ExchangeAdapter {
  return {
    id: 'binance', name: 'Binance', isTestnet: true, hasWebSocket: false,
    fetchTicker: vi.fn().mockResolvedValue(mockTicker()),
    placeOrder: vi.fn().mockResolvedValue({
      id: 'ord-1', exchangeId: 'ex-1', symbol: SYMBOL, side: 'buy',
      type: 'market', price: 50000, quantity: 0.01, filled: 0.01,
      status: 'filled', timestamp: Date.now(),
    } satisfies OrderResult),
    fetchBalance: vi.fn().mockResolvedValue({ USDT: 1000 }),
    fetchOpenOrders: vi.fn().mockResolvedValue([]),
    cancelOrder: vi.fn().mockResolvedValue(true),
    fetchPositions: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue(true),
    getServerTime: vi.fn().mockResolvedValue(Date.now()),
  } as unknown as ExchangeAdapter;
}

function mockKillswitch(enabled = true): Killswitch {
  return {
    isTradingEnabled: vi.fn().mockReturnValue(enabled),
    registerBot: vi.fn(),
    unregisterBot: vi.fn(),
    check: vi.fn(),
    onOrderFilled: vi.fn(),
    botStates: new Map(),
  } as unknown as Killswitch;
}

function mockTelemetry(): TelemetryWriter {
  return { emit: vi.fn(), snapshot: vi.fn().mockReturnValue({}) } as unknown as TelemetryWriter;
}

function botConfig(overrides: Partial<GridBotConfig> = {}): GridBotConfig {
  return {
    strategy: 'grid', symbol: SYMBOL, exchange: 'binance', mode: 'paper',
    capital: 1000, maxDrawdownPct: 20, gridSpacingPct: 1, gridLevels: 5,
    capitalPerLevelPct: 20, takeProfitPct: 2, stopLossPct: 5,
    rebalanceOnFill: false, ...overrides,
  };
}

function makeBot(configOverrides = {}, ks?: Killswitch) {
  const ksMock = ks ?? mockKillswitch();
  return {
    bot: new BotInstance(BOT_ID, botConfig(configOverrides), {
      exchange: mockExchange(), killswitch: ksMock, telemetry: mockTelemetry(),
    }, {
      onStateChange: vi.fn(), onTrade: vi.fn(),
      onLog: vi.fn(), onError: vi.fn(),
    }),
    ks: ksMock,
  };
}

describe('BotInstance extended', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // ── resume() — lines 113-120 ──────────────────────────────────────────
  describe('resume()', () => {
    it('no-op when status is not paused', async () => {
      const { bot } = makeBot();
      await bot.start();
      bot.resume();
      expect(bot.getSnapshot().status).toBe('running');
    });

    it('resumes a paused bot to running', async () => {
      const { bot } = makeBot();
      await bot.start();
      bot.pause();
      expect(bot.getSnapshot().status).toBe('paused');

      bot.resume();
      const state = bot.getSnapshot();

      expect(state.status).toBe('running');
      expect(state.error).toBeNull();
      expect(state.updatedAt).toBeGreaterThan(0);
    });

    it('emits telemetry and log on resume', async () => {
      const { bot } = makeBot();
      const telemetry = (bot as unknown as { deps: { telemetry: TelemetryWriter } }).deps.telemetry;
      const callbacks = (bot as unknown as { callbacks: { onLog: ReturnType<typeof vi.fn> } }).callbacks;
      await bot.start();
      bot.pause();
      bot.resume();

      expect(telemetry.emit).toHaveBeenCalledWith(
        BOT_ID, 'resume', expect.any(Object),
      );
      expect(callbacks.onLog).toHaveBeenCalledWith(
        expect.stringContaining('resumed'),
      );
    });

    it('resume from idle state does nothing', () => {
      const { bot } = makeBot();
      expect(bot.getSnapshot().status).toBe('idle');
      bot.resume();
      expect(bot.getSnapshot().status).toBe('idle');
    });
  });

  // ── placeOrder() — lines 166-181 ──────────────────────────────────────
  describe('placeOrder()', () => {
    it('throws when killswitch disables trading', async () => {
      const { bot } = makeBot({}, mockKillswitch(false));
      const req: OrderRequest = {
        symbol: SYMBOL, side: 'buy', type: 'market', quantity: 0.01,
      };

      await expect(bot.placeOrder(req)).rejects.toThrow(
        'Trading halted by killswitch',
      );
    });

    it('passes order context and returns result when killswitch enabled', async () => {
      const { bot } = makeBot();
      await bot.start();
      const req: OrderRequest = {
        symbol: SYMBOL, side: 'buy', type: 'limit', quantity: 0.01, price: 49000,
      };

      const result = await bot.placeOrder(req);

      expect(result).toBeDefined();
      expect(result.id).toBe('ord-1');
      expect(result.status).toBe('filled');
    });

    it('returns filled order with correct fields', async () => {
      const { bot } = makeBot();
      await bot.start();
      const req: OrderRequest = {
        symbol: SYMBOL, side: 'sell', type: 'market', quantity: 0.01,
      };

      const result = await bot.placeOrder(req);

      expect(result.symbol).toBe(SYMBOL);
      expect(result.side).toBe('buy');
      expect(result.filled).toBeGreaterThan(0);
      expect(result.pnl).toBe(25);
    });
  });
});
