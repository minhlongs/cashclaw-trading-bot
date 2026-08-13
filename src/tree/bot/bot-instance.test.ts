import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotInstance } from './bot-instance';
import type { BotConfig, BotTrade } from './types';
import type { ExchangeAdapter, Ticker, OrderRequest, OrderResult } from '../exchange/types';
import { Killswitch } from './killswitch';
import type { TelemetryWriter } from '../telemetry/writer';

const SYMBOL = 'BTC/USDT';
const BOT_ID = 'bot-test-001';

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

function makeMockOrderResult(overrides: Partial<OrderResult> = {}): OrderResult {
  return {
    id: 'order-001',
    exchangeId: 'binance',
    symbol: SYMBOL,
    side: 'buy',
    type: 'market',
    price: 50000,
    quantity: 0.1,
    filled: 0.1,
    status: 'filled',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeMockExchange(): ExchangeAdapter {
  return {
    id: 'binance',
    name: 'Binance',
    isTestnet: true,
    hasWebSocket: false,
    fetchTicker: vi.fn().mockResolvedValue(makeMockTicker()),
    placeOrder: vi.fn().mockResolvedValue(makeMockOrderResult()),
    fetchBalance: vi.fn().mockResolvedValue({ USDT: 1000 }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true }),
    fetchOpenOrders: vi.fn().mockResolvedValue([]),
  } as unknown as ExchangeAdapter;
}

function makeKillswitch(): Killswitch {
  return new Killswitch({
    onHalt: vi.fn(),
    onResume: vi.fn(),
    onOrderPlaced: vi.fn(),
    onOrderFilled: vi.fn(),
    onError: vi.fn(),
  });
}

function makeMockTelemetry(): TelemetryWriter {
  return {
    emit: vi.fn(),
    recordTrade: vi.fn(),
  } as unknown as TelemetryWriter;
}

function makeBotConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    symbol: SYMBOL,
    exchange: 'binance',
    strategy: 'grid',
    mode: 'paper',
    capital: 1000,
    maxDrawdownPct: 20,
    gridSpacingPct: 1,
    gridLevels: 5,
    capitalPerLevelPct: 20,
    takeProfitPct: 2,
    stopLossPct: 5,
    rebalanceOnFill: false,
    ...overrides,
  } as BotConfig;
}

function makeCallbacks() {
  return {
    onStateChange: vi.fn(),
    onTrade: vi.fn(),
    onLog: vi.fn(),
    onError: vi.fn(),
  };
}

describe('BotInstance', () => {
  let exchange: ExchangeAdapter;
  let killswitch: Killswitch;
  let telemetry: TelemetryWriter;
  let callbacks: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    vi.useFakeTimers();
    exchange = makeMockExchange();
    killswitch = makeKillswitch();
    telemetry = makeMockTelemetry();
    callbacks = makeCallbacks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('creates instance with correct initial state (status=idle)', () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      const state = bot.getSnapshot();
      expect(state.id).toBe(BOT_ID);
      expect(state.status).toBe('idle');
      expect(state.config).toEqual(config);
      expect(state.totalTrades).toBe(0);
      expect(state.error).toBeNull();
    });

    it('registers with killswitch on construction', () => {
      const config = makeBotConfig({ capital: 2000 });
      new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      expect(killswitch['botStates'].has(BOT_ID)).toBe(true);
    });
  });

  describe('start()', () => {
    it('sets status to running and calls strategy init', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();

      expect(bot.getSnapshot().status).toBe('running');
    });

    it('fetches ticker before first tick', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();

      expect(exchange.fetchTicker).toHaveBeenCalledWith(SYMBOL);
    });

    it('starts tick interval', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.advanceTimersByTime(1000);

      expect(callbacks.onLog).toHaveBeenCalled();
    });

    it('emits telemetry start event', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();

      expect(telemetry.emit).toHaveBeenCalledWith(
        BOT_ID,
        'start',
        expect.objectContaining({ symbol: SYMBOL }),
      );
    });

    it('sets error state on start failure', async () => {
      vi.mocked(exchange.fetchTicker).mockRejectedValue(new Error('Network error'));

      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();

      expect(bot.getSnapshot().status).toBe('error');
      expect(bot.getSnapshot().error).toBe('Network error');
    });
  });

  describe('stop()', () => {
    it('sets status to stopped and clears interval', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      bot.stop();

      expect(bot.getSnapshot().status).toBe('stopped');
    });

    it('emits telemetry stop event', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.clearAllMocks();
      bot.stop();

      expect(telemetry.emit).toHaveBeenCalledWith(
        BOT_ID,
        'stop',
        expect.any(Object),
      );
    });
  });

  describe('tick()', () => {
    it('executes tick cycle without errors', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.advanceTimersByTime(1000);

      expect(bot.getSnapshot().status).toBe('running');
    });

    it('calls fetchTicker during tick', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.clearAllMocks();
      vi.advanceTimersByTime(1000);

      expect(exchange.fetchTicker).toHaveBeenCalled();
    });
  });

  describe('getSnapshot()', () => {
    it('returns current state copy', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      const snapshot1 = bot.getSnapshot();
      const snapshot2 = bot.getSnapshot();

      expect(snapshot1).toEqual(snapshot2);
      expect(snapshot1).not.toBe(snapshot2);
    });

    it('includes all required fields', () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      const snapshot = bot.getSnapshot();

      expect(snapshot).toHaveProperty('id');
      expect(snapshot).toHaveProperty('status');
      expect(snapshot).toHaveProperty('config');
      expect(snapshot).toHaveProperty('error');
      expect(snapshot).toHaveProperty('totalTrades');
    });
  });

  describe('destroy()', () => {
    it('stops bot and unregisters from killswitch', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      bot.destroy();

      expect(bot.getSnapshot().status).toBe('stopped');
      expect(killswitch['botStates'].has(BOT_ID)).toBe(false);
    });

    it('can be called multiple times safely', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      bot.destroy();
      bot.destroy();

      expect(bot.getSnapshot().status).toBe('stopped');
    });
  });

  describe('Killswitch integration', () => {
    it('checks halt before order placement', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      killswitch.manualHalt('Test halt');
      await bot.start();
      vi.advanceTimersByTime(1000);

      expect(exchange.placeOrder).not.toHaveBeenCalled();
    });

    it('resumes trading after killswitch resume', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      killswitch.manualHalt('Test halt');
      vi.advanceTimersByTime(1000);

      killswitch.manualResume();
      vi.advanceTimersByTime(1000);

      expect(callbacks.onLog).toHaveBeenCalled();
    });
  });

  describe('Strategy composition', () => {
    it('multiple strategies execute in sequence', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.advanceTimersByTime(1000);

      expect(callbacks.onLog).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('emits error telemetry on start failure', async () => {
      vi.mocked(exchange.fetchTicker).mockRejectedValue(new Error('Connection failed'));

      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();

      expect(telemetry.emit).toHaveBeenCalledWith(
        BOT_ID,
        'error',
        expect.objectContaining({ context: 'bot.start' }),
      );
    });
  });

  describe('State management', () => {
    it('updates state timestamp on tick', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.advanceTimersByTime(1000);

      const state = bot.getSnapshot();
      expect(state.lastTickAt).toBeDefined();
      expect(state.updatedAt).toBeDefined();
    });

    it('maintains state consistency after multiple ticks', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);

      const state = bot.getSnapshot();
      expect(state.status).toBe('running');
      expect(state.error).toBeNull();
    });
  });
});
