import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CCXTTransformer } from './client';

const mocks = vi.hoisted(() => ({
  fetchTicker: vi.fn(),
  createOrder: vi.fn(),
  cancelOrder: vi.fn(),
  fetchBalance: vi.fn(),
  fetchOpenOrders: vi.fn(),
}));

vi.mock('ccxt', () => {
  const mockExchange = () => ({
    fetchTicker: mocks.fetchTicker,
    createOrder: mocks.createOrder,
    cancelOrder: mocks.cancelOrder,
    fetchBalance: mocks.fetchBalance,
    fetchOpenOrders: mocks.fetchOpenOrders,
  });
  return {
    default: {
      Binance: vi.fn().mockImplementation(mockExchange),
      Bybit: vi.fn().mockImplementation(mockExchange),
    },
  };
});

function rawTicker(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'BTC/USDT',
    last: 50000,
    bid: 49999,
    ask: 50001,
    high: 51000,
    low: 49000,
    baseVolume: 1000,
    quoteVolume: 50_000_000,
    timestamp: Date.now(),
    ...overrides,
  };
}

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

describe('CCXTTransformer — constructor, ticker & order actions', () => {
  describe('constructor', () => {
    it('creates instance for supported exchange', () => {
      const client = new CCXTTransformer({ exchange: 'binance', apiKey: 'key', apiSecret: 'secret' });
      expect(client).toBeDefined();
    });

    it('creates instance with sandbox config', () => {
      const client = new CCXTTransformer({ exchange: 'binance', apiKey: 'key', apiSecret: 'secret', sandbox: true });
      expect(client).toBeDefined();
    });

    it('throws for unsupported exchange', async () => {
      const client = new CCXTTransformer({ exchange: 'nonexistent' });
      await expect(client.fetchTicker('nonexistent', 'BTC/USDT')).rejects.toThrow('Unsupported exchange');
    });
  });

  describe('fetchTicker', () => {
    it('transforms CCXT ticker to internal type', async () => {
      mocks.fetchTicker.mockResolvedValueOnce(rawTicker());
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.fetchTicker('binance', 'BTC/USDT');

      expect(result).toEqual({
        symbol: 'BTC/USDT',
        last: 50000,
        bid: 49999,
        ask: 50001,
        high24h: 51000,
        low24h: 49000,
        volume24h: 1000,
        timestamp: expect.any(Number),
      });
      expect(mocks.fetchTicker).toHaveBeenCalledWith('BTC/USDT');
    });

    it('returns the input symbol unchanged', async () => {
      mocks.fetchTicker.mockResolvedValueOnce(rawTicker({ symbol: 'WRONG' }));
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.fetchTicker('binance', 'ETH/BTC');
      expect(result.symbol).toBe('ETH/BTC');
    });

    it('propagates fetchTicker errors', async () => {
      mocks.fetchTicker.mockRejectedValueOnce(new Error('Network timeout'));
      const client = new CCXTTransformer({ exchange: 'binance' });
      await expect(client.fetchTicker('binance', 'BTC/USDT')).rejects.toThrow('Network timeout');
    });
  });

  describe('placeOrder', () => {
    it('transforms CCXT order to internal OrderResult type', async () => {
      mocks.createOrder.mockResolvedValueOnce(rawOrder());
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.placeOrder('binance', {
        symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantity: 0.1, price: 50000,
      });

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
      expect(mocks.createOrder).toHaveBeenCalledWith('BTC/USDT', 'limit', 'buy', 0.1, 50000);
    });

    it('maps CCXT order statuses correctly', async () => {
      mocks.createOrder.mockResolvedValueOnce(rawOrder({ status: 'open', filled: 0 }));
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.placeOrder('binance', {
        symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantity: 0.1, price: 50000,
      });
      expect(result.status).toBe('open');
    });

    it('handles order with no fee', async () => {
      mocks.createOrder.mockResolvedValueOnce(rawOrder({ fee: undefined }));
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.placeOrder('binance', {
        symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantity: 0.1, price: 50000,
      });
      expect(result.fee).toBeUndefined();
      expect(result.feeCurrency).toBeUndefined();
    });

    it('propagates order creation errors', async () => {
      mocks.createOrder.mockRejectedValueOnce(new Error('Insufficient balance'));
      const client = new CCXTTransformer({ exchange: 'binance' });
      await expect(
        client.placeOrder('binance', { symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantity: 10, price: 50000 }),
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('cancelOrder', () => {
    it('cancels order and returns true on success', async () => {
      mocks.cancelOrder.mockResolvedValueOnce(undefined);
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.cancelOrder('binance', 'order-123', 'BTC/USDT');
      expect(result).toBe(true);
      expect(mocks.cancelOrder).toHaveBeenCalledWith('order-123', 'BTC/USDT');
    });

    it('returns false on cancel failure', async () => {
      mocks.cancelOrder.mockRejectedValueOnce(new Error('Order not found'));
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.cancelOrder('binance', 'bad-id', 'BTC/USDT');
      expect(result).toBe(false);
    });
  });
});
