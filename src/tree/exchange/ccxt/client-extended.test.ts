import { describe, it, expect, vi } from 'vitest';
import { CCXTTransformer } from './client';

// Mocks (hoisted for vi.mock)
const mocks = vi.hoisted(() => ({
  fetchTicker: vi.fn(),
  createOrder: vi.fn(),
  cancelOrder: vi.fn(),
  fetchBalance: vi.fn(),
  fetchOpenOrders: vi.fn(),
  fetchOrderBook: vi.fn(),
  fetchOrder: vi.fn(),
}));

vi.mock('ccxt', () => {
  const mockExchange = () => ({
    fetchTicker: mocks.fetchTicker,
    createOrder: mocks.createOrder,
    cancelOrder: mocks.cancelOrder,
    fetchBalance: mocks.fetchBalance,
    fetchOpenOrders: mocks.fetchOpenOrders,
    fetchOrderBook: mocks.fetchOrderBook,
    fetchOrder: mocks.fetchOrder,
  });
  return {
    default: {
      Binance: vi.fn().mockImplementation(mockExchange),
      Bybit: vi.fn().mockImplementation(mockExchange),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const makeClient = () => new CCXTTransformer({ exchange: 'binance' });

describe('CCXTTransformer - extended coverage', () => {
  describe('getExchange (unsupported)', () => {
    it('throws for unsupported exchange', async () => {
      const client = new CCXTTransformer({ exchange: 'unknown' });
      // getExchange is private; call via any public method to trigger it
      await expect(client.fetchTicker('unknown', 'BTC/USDT')).rejects.toThrow('Unsupported exchange: unknown');
    });
  });

  describe('fetchOrderBook', () => {
    it('returns mapped order book with bids and asks', async () => {
      mocks.fetchOrderBook.mockResolvedValueOnce({
        bids: [[100, 2], [99, 5]],
        asks: [[101, 3], [102, 1]],
        timestamp: 1000,
      });
      const book = await makeClient().fetchOrderBook('binance', 'BTC/USDT');
      expect(book.symbol).toBe('BTC/USDT');
      expect(book.bids).toEqual([
        { price: 100, quantity: 2 },
        { price: 99, quantity: 5 },
      ]);
      expect(book.asks).toEqual([
        { price: 101, quantity: 3 },
        { price: 102, quantity: 1 },
      ]);
      expect(book.timestamp).toBe(1000);
    });

    it('propagates fetchOrderBook errors', async () => {
      mocks.fetchOrderBook.mockRejectedValueOnce(new Error('Timeout'));
      await expect(makeClient().fetchOrderBook('binance', 'BTC/USDT')).rejects.toThrow('Timeout');
    });
  });

  describe('fetchOrder', () => {
    it('returns mapped order with fees', async () => {
      mocks.fetchOrder.mockResolvedValueOnce({
        id: 'o1',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'closed',
        price: 50000,
        amount: 0.1,
        filled: 0.1,
        cost: 5000,
        average: 50000,
        fee: { cost: 5, currency: 'USDT' },
        timestamp: 1000,
      });
      const order = await makeClient().fetchOrder('binance', 'o1', 'BTC/USDT');
      expect(order.id).toBe('o1');
      expect(order.exchangeId).toBe('binance');
      expect(order.symbol).toBe('BTC/USDT');
      expect(order.side).toBe('buy');
      expect(order.type).toBe('limit');
      expect(order.status).toBe('filled');
      expect(order.price).toBe(50000);
      expect(order.quantity).toBe(0.1);
      expect(order.filled).toBe(0.1);
      expect(order.fee).toBe(5);
      expect(order.feeCurrency).toBe('USDT');
      expect(order.pnl).toBe(0);
    });

    it('throws when order not found', async () => {
      mocks.fetchOrder.mockResolvedValueOnce(null);
      await expect(makeClient().fetchOrder('binance', 'missing', 'BTC/USDT')).rejects.toThrow(
        'Order not found: missing',
      );
    });

    it('handles missing fee gracefully', async () => {
      mocks.fetchOrder.mockResolvedValueOnce({
        id: 'o2',
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'market',
        status: 'closed',
        price: 3000,
        amount: 1,
        filled: 1,
        cost: 3000,
        average: 3000,
        fee: null,
        timestamp: 2000,
      });
      const order = await makeClient().fetchOrder('binance', 'o2', 'ETH/USDT');
      expect(order.fee).toBeUndefined();
      expect(order.feeCurrency).toBeUndefined();
    });
  });

  describe('placeOrder', () => {
    it('handles missing fee on order result', async () => {
      mocks.createOrder.mockResolvedValueOnce({
        id: 'o3',
        status: 'open',
        price: 100,
        amount: 5,
        filled: 0,
        cost: 0,
        average: null,
        fee: null,
        timestamp: 3000,
      });
      const order = await makeClient().placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        quantity: 5,
        price: 100,
      });
      expect(order.id).toBe('o3');
      expect(order.fee).toBeUndefined();
      expect(order.feeCurrency).toBeUndefined();
    });
  });

  describe('cancelOrder', () => {
    it('returns false on error', async () => {
      mocks.cancelOrder.mockRejectedValueOnce(new Error('Order not found'));
      const result = await makeClient().cancelOrder('binance', 'o4', 'BTC/USDT');
      expect(result).toBe(false);
    });
  });
});
