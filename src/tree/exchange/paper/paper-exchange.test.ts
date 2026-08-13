import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaperExchange } from './index';

vi.mock('../rate-limiter', () => ({
  rateLimiter: {
    acquire: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('PaperExchange', () => {
  let exchange: PaperExchange;

  beforeEach(() => {
    vi.clearAllMocks();
    exchange = new PaperExchange([
      { currency: 'USDT', total: 10000 },
      { currency: 'BTC', total: 1 },
    ]);
  });

  describe('initialization', () => {
    it('sets id and name', () => {
      expect(exchange.id).toBe('paper');
      expect(exchange.name).toBe('Paper Trading');
    });

    it('initializes with provided balances', async () => {
      const balances = await exchange.fetchBalances('binance');
      expect(balances).toHaveLength(2);
      expect(balances.find(b => b.currency === 'USDT')?.total).toBe(10000);
      expect(balances.find(b => b.currency === 'BTC')?.total).toBe(1);
    });
  });

  describe('placeOrder', () => {
    it('creates market order with filled status', async () => {
      const result = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });

      expect(result.status).toBe('filled');
      expect(result.filled).toBe(0.1);
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.side).toBe('buy');
      expect(result.type).toBe('market');
    });

    it('creates limit order with open status', async () => {
      const result = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        quantity: 0.5,
        price: 50000,
      });

      expect(result.status).toBe('open');
      expect(result.filled).toBe(0);
      expect(result.price).toBe(50000);
    });

    it('calculates fee correctly', async () => {
      const result = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 1,
      });

      expect(result.fee).toBeCloseTo(0.001, 6);
    });

    it('generates unique order ids', async () => {
      const order1 = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });

      const order2 = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.2,
      });

      expect(order1.id).not.toBe(order2.id);
    });
  });

  describe('cancelOrder', () => {
    it('cancels open order', async () => {
      const order = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        quantity: 0.5,
        price: 50000,
      });

      const cancelled = await exchange.cancelOrder(order.id, 'BTC/USDT');
      expect(cancelled).toBe(true);

      const trade = exchange.getOrder(order.id);
      expect(trade?.status).toBe('cancelled');
    });

    it('returns false for non-existent order', async () => {
      const cancelled = await exchange.cancelOrder('fake_id', 'BTC/USDT');
      expect(cancelled).toBe(false);
    });

    it('returns false for filled order', async () => {
      const order = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });

      const cancelled = await exchange.cancelOrder(order.id, 'BTC/USDT');
      expect(cancelled).toBe(false);
    });
  });

  describe('fillOrder', () => {
    it('fills limit order partially', async () => {
      const order = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        quantity: 1,
        price: 50000,
      });

      const filled = exchange.fillOrder(order.id, 50000, 0.5);
      expect(filled).toBe(true);

      const trade = exchange.getOrder(order.id);
      expect(trade?.status).toBe('partially_filled');
      expect(trade?.filled).toBe(0.5);
    });

    it('fills limit order completely', async () => {
      const order = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        quantity: 1,
        price: 50000,
      });

      const filled = exchange.fillOrder(order.id, 50000, 1);
      expect(filled).toBe(true);

      const trade = exchange.getOrder(order.id);
      expect(trade?.status).toBe('filled');
    });

    it('returns false for non-existent order', () => {
      const filled = exchange.fillOrder('fake_id', 50000, 1);
      expect(filled).toBe(false);
    });

    it('returns false for already filled order', async () => {
      const order = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });

      const filled = exchange.fillOrder(order.id, 50000, 0.1);
      expect(filled).toBe(false);
    });
  });

  describe('fetchOrder', () => {
    it('returns order result', async () => {
      const order = await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });

      const result = await exchange.fetchOrder(order.id, 'BTC/USDT');
      expect(result.id).toBe(order.id);
      expect(result.status).toBe('filled');
    });

    it('throws for non-existent order', async () => {
      await expect(
        exchange.fetchOrder('fake_id', 'BTC/USDT'),
      ).rejects.toThrow('Order not found: fake_id');
    });
  });

  describe('fetchOpenOrders', () => {
    it('returns only open orders', async () => {
      await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });

      await exchange.placeOrder('binance', {
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        quantity: 0.5,
        price: 50000,
      });

      const openOrders = await exchange.fetchOpenOrders('BTC/USDT');
      expect(openOrders).toHaveLength(1);
      expect(openOrders[0].type).toBe('limit');
    });
  });

  describe('utility methods', () => {
    it('ping returns true', async () => {
      const result = await exchange.ping();
      expect(result).toBe(true);
    });

    it('getServerTime returns timestamp', async () => {
      const time = await exchange.getServerTime();
      expect(time).toBeGreaterThan(0);
    });
  });
});
