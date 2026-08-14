import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaperExchange } from './index';

vi.mock('../rate-limiter', () => ({
  rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) },
}));

const EX = 'binance' as const;

describe('PaperExchange', () => {
  let ex: PaperExchange;

  const buy = (qty = 0.1, type: 'market' | 'limit' = 'market', price?: number) =>
    ex.placeOrder(EX, { symbol: 'BTC/USDT', side: 'buy', type, quantity: qty, price });
  const sell = (qty = 0.1, type: 'market' | 'limit' = 'market', price?: number) =>
    ex.placeOrder(EX, { symbol: 'BTC/USDT', side: 'sell', type, quantity: qty, price });

  beforeEach(() => {
    vi.clearAllMocks();
    ex = new PaperExchange([{ currency: 'USDT', total: 10000 }, { currency: 'BTC', total: 1 }]);
  });

  describe('fetchTicker', () => {
    it('returns valid structure with numeric fields', async () => {
      const t = await ex.fetchTicker(EX, 'BTC/USDT');
      expect(t.symbol).toBe('BTC/USDT');
      expect(typeof t.last).toBe('number');
      expect(typeof t.bid).toBe('number');
      expect(typeof t.ask).toBe('number');
      expect(t.timestamp).toBeGreaterThan(0);
    });
  });

  describe('fetchOrderBook', () => {
    it('returns empty book with timestamp and accepts depth param', async () => {
      const b = await ex.fetchOrderBook(EX, 'BTC/USDT', 5);
      expect(b.symbol).toBe('BTC/USDT');
      expect(b.bids).toEqual([]);
      expect(b.asks).toEqual([]);
      expect(b.timestamp).toBeGreaterThan(0);
    });
  });

  describe('fetchBalances', () => {
    it('returns initialized balances', async () => {
      const bal = await ex.fetchBalances(EX);
      expect(bal).toHaveLength(2);
      expect(bal.find((b) => b.currency === 'USDT')).toEqual({
        currency: 'USDT', free: 10000, used: 0, total: 10000,
      });
      expect(bal.find((b) => b.currency === 'BTC')).toEqual({
        currency: 'BTC', free: 1, used: 0, total: 1,
      });
    });
  });

  describe('placeOrder', () => {
    it('market buy fills immediately with fee', async () => {
      const r = await buy(0.01);
      expect(r.id).toMatch(/^paper_\d+_\d+$/);
      expect(r.exchangeId).toBe(EX);
      expect(r.status).toBe('filled');
      expect(r.filled).toBe(0.01);
      expect(r.fee).toBeCloseTo(0.01 * 0.001, 10);
      expect(r.timestamp).toBeGreaterThan(0);
    });

    it('market sell fills immediately', async () => {
      const r = await sell(0.5);
      expect(r.status).toBe('filled');
      expect(r.side).toBe('sell');
      expect(r.filled).toBe(0.5);
    });

    it('limit buy stays open with zero filled', async () => {
      const r = await buy(0.1, 'limit', 50000);
      expect(r.status).toBe('open');
      expect(r.filled).toBe(0);
      expect(r.price).toBe(50000);
    });

    it('limit sell stays open', async () => {
      const r = await ex.placeOrder(EX, {
        symbol: 'ETH/USDT', side: 'sell', type: 'limit', quantity: 5, price: 3000,
      });
      expect(r.status).toBe('open');
      expect(r.side).toBe('sell');
    });

    it('generates unique order ids', async () => {
      const [a, b] = await Promise.all([buy(0.01), buy(0.01)]);
      expect(a.id).not.toBe(b.id);
    });

    it('fee is 0.1% of quantity', async () => {
      expect((await buy(1)).fee).toBeCloseTo(0.001, 10);
    });
  });

  describe('cancelOrder', () => {
    it('cancels open limit order', async () => {
      const o = await buy(0.1, 'limit', 30000);
      expect(await ex.cancelOrder(o.id, 'BTC/USDT')).toBe(true);
      expect((await ex.fetchOrder(o.id, 'BTC/USDT')).status).toBe('cancelled');
    });

    it('returns false for non-existent or filled orders', async () => {
      expect(await ex.cancelOrder('fake', 'BTC/USDT')).toBe(false);
      const filled = await buy(0.01);
      expect(await ex.cancelOrder(filled.id, 'BTC/USDT')).toBe(false);
    });

    it('allows new order after cancel', async () => {
      const o1 = await buy(0.1, 'limit', 30000);
      await ex.cancelOrder(o1.id, 'BTC/USDT');
      const o2 = await buy(0.2, 'limit', 29000);
      expect(o2.id).not.toBe(o1.id);
      expect(o2.status).toBe('open');
    });
  });

  describe('fetchOrder', () => {
    it('retrieves order by id with all fields', async () => {
      const o = await buy(0.1);
      const f = await ex.fetchOrder(o.id, 'BTC/USDT');
      expect(f.id).toBe(o.id);
      expect(f.status).toBe('filled');
      for (const k of ['id', 'exchangeId', 'symbol', 'side', 'type', 'price', 'quantity', 'filled', 'status', 'fee', 'timestamp']) {
        expect(f).toHaveProperty(k);
      }
    });

    it('throws for unknown order', async () => {
      await expect(ex.fetchOrder('nope', 'BTC/USDT')).rejects.toThrow('Order not found');
    });
  });

  describe('fillOrder', () => {
    it('fully fills an open limit order', async () => {
      const o = await buy(0.1, 'limit', 60000);
      expect(ex.fillOrder(o.id, 59500, 0.1)).toBe(true);
      const f = await ex.fetchOrder(o.id, 'BTC/USDT');
      expect(f.status).toBe('filled');
      expect(f.filled).toBe(0.1);
      expect(f.price).toBe(59500);
    });

    it('partially fills an open limit order', async () => {
      const o = await sell(1, 'limit', 65000);
      expect(ex.fillOrder(o.id, 65000, 0.3)).toBe(true);
      const f = await ex.fetchOrder(o.id, 'BTC/USDT');
      expect(f.status).toBe('partially_filled');
      expect(f.filled).toBe(0.3);
    });

    it('returns false for non-existent or already filled orders', async () => {
      expect(ex.fillOrder('nope', 100, 1)).toBe(false);
      const filled = await buy(0.01);
      expect(ex.fillOrder(filled.id, 50000, 0.01)).toBe(false);
    });
  });

  describe('getOrders / getOrder', () => {
    it('getOrders returns all, getOrder returns specific trade or undefined', async () => {
      await buy(0.01);
      await ex.placeOrder(EX, { symbol: 'ETH/USDT', side: 'sell', type: 'limit', quantity: 1, price: 3000 });
      expect(ex.getOrders().size).toBe(2);
      const o = await buy(0.1);
      expect(ex.getOrder(o.id)?.orderId).toBe(o.id);
      expect(ex.getOrder('missing')).toBeUndefined();
    });
  });

  describe('fetchOpenOrders', () => {
    it('returns only open orders', async () => {
      await buy(0.01);
      await ex.placeOrder(EX, { symbol: 'ETH/USDT', side: 'sell', type: 'limit', quantity: 5, price: 4000 });
      const open = await ex.fetchOpenOrders();
      expect(open).toHaveLength(1);
      expect(open[0]!.status).toBe('open');
    });

    it('returns empty array when none open', async () => {
      expect(await ex.fetchOpenOrders()).toEqual([]);
    });
  });

  describe('utility', () => {
    it('ping returns true', async () => {
      expect(await ex.ping()).toBe(true);
    });

    it('getServerTime returns current timestamp', async () => {
      const t = await ex.getServerTime();
      expect(t).toBeGreaterThanOrEqual(Date.now() - 5000);
    });
  });
});
