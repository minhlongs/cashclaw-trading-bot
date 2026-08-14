// client-extended.test.ts — cover fetchOrder (transformOrder) + edge cases
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted to work with vi.mock factory) ──────────────
const mocks = vi.hoisted(() => ({
  fetchTicker: vi.fn(),
  createOrder: vi.fn(),
  cancelOrder: vi.fn(),
  fetchBalance: vi.fn(),
  fetchOpenOrders: vi.fn(),
  fetchOrder: vi.fn(),
}));

vi.mock('ccxt', () => {
  const mockExchange = () => ({
    fetchTicker: mocks.fetchTicker,
    createOrder: mocks.createOrder,
    cancelOrder: mocks.cancelOrder,
    fetchBalance: mocks.fetchBalance,
    fetchOpenOrders: mocks.fetchOpenOrders,
    fetchOrder: mocks.fetchOrder,
  });
  return {
    default: {
      Binance: vi.fn().mockImplementation(mockExchange),
      Binanceusdm: vi.fn().mockImplementation(mockExchange),
      Okx: vi.fn().mockImplementation(mockExchange),
      Bybit: vi.fn().mockImplementation(mockExchange),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { CCXTTransformer, createCCXTClient } from './client';

// ── Helpers ────────────────────────────────────────────────────

function rawOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-123',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'limit',
    price: 50000,
    amount: 0.1,
    filled: 0.1,
    status: 'closed',
    fee: { cost: 5, currency: 'USDT' },
    timestamp: 1700000000000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── fetchOrder — covers transformOrder (lines 61-69, 156-185) ───────────────

describe('fetchOrder', () => {
  it('transforms raw CCXT order to internal type', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(rawOrder());
    const client = new CCXTTransformer({ exchange: 'binance', apiKey: 'k', apiSecret: 's' });
    const result = await client.fetchOrder('binance', 'order-123', 'BTC/USDT');
    expect(result).toEqual({
      id: 'order-123',
      exchangeId: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.1,
      filled: 0.1,
      status: 'filled',
      fee: 5,
      feeCurrency: 'USDT',
      timestamp: 1700000000000,
      pnl: 0,
    });
  });

  it('maps open status correctly', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(rawOrder({ status: 'open', filled: 0 }));
    const client = new CCXTTransformer({ exchange: 'binance' });
    const result = await client.fetchOrder('binance', 'o2', 'BTC/USDT');
    expect(result.status).toBe('open');
  });

  it('maps partially_filled status correctly', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(rawOrder({ status: 'partially_filled', filled: 0.05 }));
    const client = new CCXTTransformer({ exchange: 'binance' });
    const result = await client.fetchOrder('binance', 'o3', 'BTC/USDT');
    expect(result.status).toBe('partially_filled');
  });

  it('maps cancelled status correctly', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(rawOrder({ status: 'canceled' }));
    const client = new CCXTTransformer({ exchange: 'binance' });
    const result = await client.fetchOrder('binance', 'o4', 'BTC/USDT');
    expect(result.status).toBe('cancelled');
  });

  it('handles order with no fee', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(rawOrder({ fee: undefined }));
    const client = new CCXTTransformer({ exchange: 'binance' });
    const result = await client.fetchOrder('binance', 'o5', 'BTC/USDT');
    expect(result.fee).toBeUndefined();
    expect(result.feeCurrency).toBeUndefined();
  });

  it('handles order with empty fee currency string', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(rawOrder({ fee: { cost: 1, currency: '' } }));
    const client = new CCXTTransformer({ exchange: 'binance' });
    const result = await client.fetchOrder('binance', 'o6', 'BTC/USDT');
    expect(result.feeCurrency).toBeUndefined();
  });

  it('handles order with null timestamp (uses Date.now)', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(rawOrder({ timestamp: null }));
    const client = new CCXTTransformer({ exchange: 'binance' });
    const before = Date.now();
    const result = await client.fetchOrder('binance', 'o7', 'BTC/USDT');
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('throws when order not found (null)', async () => {
    mocks.fetchOrder.mockResolvedValueOnce(null);
    const client = new CCXTTransformer({ exchange: 'binance' });
    await expect(client.fetchOrder('binance', 'missing', 'BTC/USDT'))
      .rejects.toThrow('Order not found: missing');
  });

  it('propagates exchange fetchOrder errors', async () => {
    mocks.fetchOrder.mockRejectedValueOnce(new Error('Network timeout'));
    const client = new CCXTTransformer({ exchange: 'binance' });
    await expect(client.fetchOrder('binance', 'x', 'BTC/USDT'))
      .rejects.toThrow('Network timeout');
  });
});

// ── cancelOrder error logging (line 129) ────────────────────────────────────

describe('cancelOrder error edge cases', () => {
  it('returns false and logs when cancel throws non-Error', async () => {
    mocks.cancelOrder.mockRejectedValueOnce('string error');
    const client = new CCXTTransformer({ exchange: 'binance' });
    const result = await client.cancelOrder('binance', 'x', 'BTC/USDT');
    expect(result).toBe(false);
  });
});

// ── fetchBalances edge case (empty free/used) ───────────────────────────────

describe('fetchBalances edge cases', () => {
  it('defaults missing free/used values to 0', async () => {
    mocks.fetchBalance.mockResolvedValueOnce({
      total: { BTC: 1 },
      free: {},
      used: {},
    });
    const client = new CCXTTransformer({ exchange: 'binance' });
    const result = await client.fetchBalances('binance');
    expect(result).toEqual([{ currency: 'BTC', free: 0, used: 0, total: 1 }]);
  });
});

// ── unsupported exchange path ───────────────────────────────────────────────

describe('unsupported exchange', () => {
  it('getExchange throws for unknown exchange name', () => {
    const client = new CCXTTransformer({ exchange: 'nonexistent' });
    expect(() => (client as unknown as { getExchange(): unknown }).getExchange())
      .toThrow('Unsupported exchange: nonexistent');
  });
});

// ── createCCXTClient edge cases ─────────────────────────────────────────────

describe('createCCXTClient edge cases', () => {
  it('creates transformer with all config fields', () => {
    const client = createCCXTClient('okx', {
      apiKey: 'k', apiSecret: 's', sandbox: true,
    });
    expect(client).toBeInstanceOf(CCXTTransformer);
  });

  it('creates transformer with no config', () => {
    const client = createCCXTClient('bybit');
    expect(client).toBeInstanceOf(CCXTTransformer);
  });
});
