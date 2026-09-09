import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotInstance } from './bot-instance';
import type { GridBotConfig } from './types';
import type { ExchangeAdapter, Ticker } from '../exchange/types';
import type { Killswitch } from './killswitch';
import type { TelemetryWriter } from '../telemetry/writer';
import type { ExchangeOrchestrator } from '@/land/exchange-orchestration';

const SYMBOL = 'BTC/USDT';
const BOT_ID = 'branch-bot-001';

function mockTicker(overrides: Partial<Ticker> = {}): Ticker {
  return {
    symbol: SYMBOL,
    last: 50000,
    bid: 49950,
    ask: 50050,
    high24h: 51000,
    low24h: 49000,
    volume24h: 100,
    timestamp: Date.now(),
    ...overrides,
  };
}

function mockExchange(ticker: Ticker | null = mockTicker()): ExchangeAdapter {
  return {
    id: 'binance',
    name: 'Binance',
    isTestnet: true,
    hasWebSocket: false,
    fetchTicker: vi.fn().mockResolvedValue(ticker),
    placeOrder: vi.fn(),
    fetchBalance: vi.fn().mockResolvedValue({ USDT: 1000 }),
    fetchOpenOrders: vi.fn().mockResolvedValue([]),
    cancelOrder: vi.fn().mockResolvedValue(true),
    fetchPositions: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue(true),
    getServerTime: vi.fn().mockResolvedValue(Date.now()),
  } as unknown as ExchangeAdapter;
}

function mockKillswitch(): Killswitch {
  return {
    isTradingEnabled: vi.fn().mockReturnValue(true),
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
    strategy: 'grid',
    symbol: SYMBOL,
    exchange: 'binance',
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
  };
}

describe('BotInstance branches and accessors', () => {
  let exchange: ExchangeAdapter;
  let killswitch: Killswitch;
  let telemetry: TelemetryWriter;
  let callbacks: { onStateChange: ReturnType<typeof vi.fn>; onTrade: ReturnType<typeof vi.fn>; onLog: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    exchange = mockExchange();
    killswitch = mockKillswitch();
    telemetry = mockTelemetry();
    callbacks = {
      onStateChange: vi.fn(),
      onTrade: vi.fn(),
      onLog: vi.fn(),
      onError: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getConfig returns a copy of the configuration', () => {
    const config = botConfig();
    const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
    const retrieved = bot.getConfig();
    expect(retrieved.symbol).toBe(SYMBOL);
    expect(retrieved.strategy).toBe('grid');
  });

  it('patchState modifies bot state and updates timestamp', () => {
    const bot = new BotInstance(BOT_ID, botConfig(), { exchange, killswitch, telemetry }, callbacks);
    const beforeTime = Date.now();
    bot.patchState({ totalPnl: 150 });
    const snapshot = bot.getSnapshot();
    expect(snapshot.totalPnl).toBe(150);
    expect(snapshot.updatedAt).toBeGreaterThanOrEqual(beforeTime);
  });

  it('hasStrategy reflects whether strategy is initialized', async () => {
    const bot = new BotInstance(BOT_ID, botConfig(), { exchange, killswitch, telemetry }, callbacks);
    expect(bot.hasStrategy()).toBe(false);
    await bot.start();
    expect(bot.hasStrategy()).toBe(true);
    bot.stop();
    expect(bot.hasStrategy()).toBe(false);
  });

  it('start early returns if already running', async () => {
    const bot = new BotInstance(BOT_ID, botConfig(), { exchange, killswitch, telemetry }, callbacks);
    await bot.start();
    expect(exchange.fetchTicker).toHaveBeenCalledTimes(1);
    await bot.start();
    expect(exchange.fetchTicker).toHaveBeenCalledTimes(1);
  });

  it('start uses exchangeOrchestrator when available and handles ok=true', async () => {
    const mockOrchestrator: ExchangeOrchestrator = {
      fetchTicker: vi.fn().mockResolvedValue({
        ok: true,
        data: mockTicker({ last: 55000 }),
      }),
    } as unknown as ExchangeOrchestrator;

    const bot = new BotInstance(
      BOT_ID,
      botConfig(),
      { exchange, killswitch, telemetry, exchangeOrchestrator: mockOrchestrator },
      callbacks,
    );

    await bot.start();
    expect(mockOrchestrator.fetchTicker).toHaveBeenCalledWith('paper', SYMBOL);
    expect(bot.getSnapshot().status).toBe('running');
  });

  it('start fails when exchangeOrchestrator returns ok=false', async () => {
    const mockOrchestrator: ExchangeOrchestrator = {
      fetchTicker: vi.fn().mockResolvedValue({
        ok: false,
        error: 'Failed to fetch',
      }),
    } as unknown as ExchangeOrchestrator;

    const bot = new BotInstance(
      BOT_ID,
      botConfig(),
      { exchange, killswitch, telemetry, exchangeOrchestrator: mockOrchestrator },
      callbacks,
    );

    await bot.start();
    expect(bot.getSnapshot().status).toBe('error');
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Failed to fetch ticker') }),
      'bot.start',
    );
  });

  it('start fails when ticker last price <= 0', async () => {
    const invalidExchange = mockExchange(mockTicker({ last: 0 }));
    const bot = new BotInstance(
      BOT_ID,
      botConfig(),
      { exchange: invalidExchange, killswitch, telemetry },
      callbacks,
    );

    await bot.start();
    expect(bot.getSnapshot().status).toBe('error');
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid price') }),
      'bot.start',
    );
  });

  it('start handles non-Error thrown objects', async () => {
    const throwingExchange = {
      ...mockExchange(),
      fetchTicker: vi.fn().mockRejectedValue('Fatal network rejection string'),
    } as unknown as ExchangeAdapter;

    const bot = new BotInstance(
      BOT_ID,
      botConfig(),
      { exchange: throwingExchange, killswitch, telemetry },
      callbacks,
    );

    await bot.start();
    expect(bot.getSnapshot().status).toBe('error');
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Fatal network rejection string' }),
      'bot.start',
    );
  });

  it('pause early returns if status is not running', () => {
    const bot = new BotInstance(BOT_ID, botConfig(), { exchange, killswitch, telemetry }, callbacks);
    bot.pause();
    expect(bot.getSnapshot().status).toBe('idle');
  });

  it('stop early returns if status is already stopped', async () => {
    const bot = new BotInstance(BOT_ID, botConfig(), { exchange, killswitch, telemetry }, callbacks);
    await bot.start();
    bot.stop();
    expect(bot.getSnapshot().status).toBe('stopped');
    vi.clearAllMocks();
    bot.stop();
    expect(callbacks.onLog).not.toHaveBeenCalled();
  });
});
