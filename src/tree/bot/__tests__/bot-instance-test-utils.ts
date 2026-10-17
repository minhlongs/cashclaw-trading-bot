import { vi } from 'vitest';
import type { BotConfig } from '../types';
import type { ExchangeAdapter, Ticker, OrderResult } from '../../exchange/types';
import { Killswitch } from '../killswitch';
import type { TelemetryWriter } from '../../telemetry/writer';

export const SYMBOL = 'BTC/USDT';
export const BOT_ID = 'bot-test-001';

export function makeMockTicker(overrides: Partial<Ticker> = {}): Ticker {
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

export function makeMockOrderResult(overrides: Partial<OrderResult> = {}): OrderResult {
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

export function makeMockExchange(): ExchangeAdapter {
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

export function makeKillswitch(): Killswitch {
  return new Killswitch({
    onHalt: vi.fn(),
    onResume: vi.fn(),
    onOrderPlaced: vi.fn(),
    onOrderFilled: vi.fn(),
    onError: vi.fn(),
  });
}

export function makeMockTelemetry(): TelemetryWriter {
  return {
    emit: vi.fn(),
    recordTrade: vi.fn(),
  } as unknown as TelemetryWriter;
}

export function makeBotConfig(overrides: Partial<BotConfig> = {}): BotConfig {
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

export function makeCallbacks() {
  return {
    onStateChange: vi.fn(),
    onTrade: vi.fn(),
    onLog: vi.fn(),
    onError: vi.fn(),
  };
}
