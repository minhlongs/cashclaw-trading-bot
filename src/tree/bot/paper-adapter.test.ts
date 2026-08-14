import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPaperAdapter } from './paper-adapter';

describe('createPaperAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns adapter with correct id and name', () => {
    const adapter = createPaperAdapter(10000);
    expect(adapter.id).toBe('paper');
    expect(adapter.name).toBe('Paper Trading');
  });

  it('seeds USDT balance with provided capital', async () => {
    const adapter = createPaperAdapter(10000);
    const balances = await adapter.fetchBalances();
    expect(balances).toEqual([{ currency: 'USDT', free: 10000, used: 0, total: 10000 }]);
  });

  it('accepts zero capital', async () => {
    const adapter = createPaperAdapter(0);
    const balances = await adapter.fetchBalances();
    expect(balances[0].total).toBe(0);
  });

  describe('fetchTicker', () => {
    it('returns zeroed ticker', async () => {
      const adapter = createPaperAdapter(10000);
      const ticker = await adapter.fetchTicker('BTC/USDT');
      expect(ticker.last).toBe(0);
      expect(ticker.bid).toBe(0);
      expect(ticker.ask).toBe(0);
      expect(ticker.symbol).toBe('BTC/USDT');
      expect(ticker.timestamp).toBe(Date.now());
    });
  });

  describe('fetchOrderBook', () => {
    it('returns empty order book', async () => {
      const adapter = createPaperAdapter(10000);
      const book = await adapter.fetchOrderBook('BTC/USDT');
      expect(book.bids).toEqual([]);
      expect(book.asks).toEqual([]);
      expect(book.symbol).toBe('BTC/USDT');
      expect(book.timestamp).toBe(Date.now());
    });
  });

  describe('placeOrder - market orders', () => {
    it('fills market buy immediately with correct fee', async () => {
      const adapter = createPaperAdapter(10000);
      const result = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.5,
      });
      expect(result.status).toBe('filled');
      expect(result.filled).toBe(0.5);
      expect(result.fee).toBeCloseTo(0.0005); // 0.5 * 0.001
      expect(result.exchangeId).toBe('paper');
      expect(result.side).toBe('buy');
    });

    it('fills market sell immediately', async () => {
      const adapter = createPaperAdapter(10000);
      const result = await adapter.placeOrder({
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'market',
        quantity: 2,
      });
      expect(result.status).toBe('filled');
      expect(result.filled).toBe(2);
    });

    it('generates sequential order IDs', async () => {
      const adapter = createPaperAdapter(10000);
      const o1 = await adapter.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 1 });
      vi.setSystemTime(new Date('2026-08-14T12:00:01Z'));
      const o2 = await adapter.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 1 });
      expect(o1.id).toMatch(/^paper_1_/);
      expect(o2.id).toMatch(/^paper_2_/);
      expect(o1.id).not.toBe(o2.id);
    });
  });

  describe('placeOrder - limit orders', () => {
    it('places limit buy as open', async () => {
      const adapter = createPaperAdapter(10000);
      const result = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50000,
        quantity: 0.1,
      });
      expect(result.status).toBe('open');
      expect(result.filled).toBe(0);
      expect(result.price).toBe(50000);
    });

    it('places limit sell as open', async () => {
      const adapter = createPaperAdapter(10000);
      const result = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        price: 60000,
        quantity: 0.1,
      });
      expect(result.status).toBe('open');
      expect(result.filled).toBe(0);
    });
  });

  describe('cancelOrder', () => {
    it('cancels an open order', async () => {
      const adapter = createPaperAdapter(10000);
      const order = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50000,
        quantity: 0.1,
      });
      const cancelled = await adapter.cancelOrder(order.id, 'BTC/USDT');
      expect(cancelled).toBe(true);
      const fetched = await adapter.fetchOrder(order.id, 'BTC/USDT');
      expect(fetched.status).toBe('cancelled');
    });

    it('rejects cancelling filled order', async () => {
      const adapter = createPaperAdapter(10000);
      const order = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });
      const cancelled = await adapter.cancelOrder(order.id, 'BTC/USDT');
      expect(cancelled).toBe(false);
    });

    it('rejects unknown order ID', async () => {
      const adapter = createPaperAdapter(10000);
      const cancelled = await adapter.cancelOrder('nonexistent', 'BTC/USDT');
      expect(cancelled).toBe(false);
    });
  });

  describe('fetchOrder', () => {
    it('returns order by ID', async () => {
      const adapter = createPaperAdapter(10000);
      const order = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1,
      });
      const fetched = await adapter.fetchOrder(order.id, 'BTC/USDT');
      expect(fetched.id).toBe(order.id);
      expect(fetched.symbol).toBe('BTC/USDT');
    });

    it('throws for unknown order', async () => {
      const adapter = createPaperAdapter(10000);
      await expect(adapter.fetchOrder('no-such-id', 'BTC/USDT')).rejects.toThrow('Order not found');
    });
  });

  describe('fetchOpenOrders', () => {
    it('returns only open orders', async () => {
      const adapter = createPaperAdapter(10000);
      await adapter.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.1 });
      const limit = await adapter.placeOrder({
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'limit',
        price: 4000,
        quantity: 1,
      });
      const open = await adapter.fetchOpenOrders();
      expect(open).toHaveLength(1);
      expect(open[0].id).toBe(limit.id);
    });

    it('returns empty when all orders filled or cancelled', async () => {
      const adapter = createPaperAdapter(10000);
      const order = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50000,
        quantity: 0.1,
      });
      await adapter.cancelOrder(order.id, 'BTC/USDT');
      const open = await adapter.fetchOpenOrders();
      expect(open).toEqual([]);
    });
  });

  describe('ping and getServerTime', () => {
    it('ping returns true', async () => {
      const adapter = createPaperAdapter(10000);
      expect(await adapter.ping()).toBe(true);
    });

    it('getServerTime returns current time', async () => {
      const adapter = createPaperAdapter(10000);
      const time = await adapter.getServerTime();
      expect(time).toBe(Date.now());
    });
  });
});
