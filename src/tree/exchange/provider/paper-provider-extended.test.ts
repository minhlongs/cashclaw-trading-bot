// paper-provider-extended.test.ts — extra coverage for PaperExchangeProvider
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaperExchangeProvider } from './paper-provider';
import { PaperExchange } from '../paper';
import type { PaperProviderConfig } from './types';

const makeConfig = (o?: Partial<PaperProviderConfig>): PaperProviderConfig => ({
  type: 'paper',
  exchangeId: 'binance',
  initialBalances: [
    { currency: 'USDT', total: 10000 },
    { currency: 'BTC', total: 0.5 },
  ],
  ...o,
});

describe('PaperExchangeProvider — extended coverage', () => {
  let provider: PaperExchangeProvider;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    provider = new PaperExchangeProvider(makeConfig());
  });

  afterEach(() => { vi.useRealTimers(); });

  describe('getConfig / getBudget', () => {
    it('returns a shallow copy of config', () => {
      const cfg = provider.getConfig();
      expect(cfg.exchangeId).toBe('binance');
      cfg.exchangeId = 'mutated';
      expect(provider.getConfig().exchangeId).toBe('binance');
    });

    it('returns default budget limits', () => {
      expect(provider.getBudget()).toEqual({ reqPerMin: 100, reqPerHour: 5000 });
    });
  });

  describe('recordSuccess', () => {
    it('uses direct assignment on first call, exponential average on second', () => {
      provider.recordSuccess(100);
      expect(provider.getHealth().latencyMs).toBe(100);
      provider.recordSuccess(200);
      expect(provider.getHealth().latencyMs).toBeCloseTo(130);
    });
  });

  describe('isUnhealthy / isCircuitOpen / getBackoffMs', () => {
    it('isUnhealthy false when healthy', () => {
      expect(provider.isUnhealthy()).toBe(false);
    });

    it('isUnhealthy true when score < 40', () => {
      for (let i = 0; i < 5; i++) provider.recordFailure();
      expect(provider.getHealth().score).toBeLessThan(40);
      expect(provider.isUnhealthy()).toBe(true);
    });

    it('isCircuitOpen false initially, getBackoffMs 0', () => {
      expect(provider.isCircuitOpen()).toBe(false);
      expect(provider.getBackoffMs()).toBe(0);
    });

    it('getBackoffMs returns positive ms during cooldown', () => {
      provider.recordFailure();
      expect(provider.getBackoffMs()).toBeGreaterThan(0);
    });
  });

  describe('fetchBalances', () => {
    it('returns balances on success', async () => {
      expect(await provider.fetchBalances('binance')).toHaveLength(2);
    });

    it('records failure and throws when adapter rejects', async () => {
      vi.spyOn(PaperExchange.prototype, 'fetchBalances')
        .mockRejectedValueOnce(new Error('service unavailable'));
      await expect(provider.fetchBalances('binance'))
        .rejects.toThrow('service unavailable');
      expect(provider.getHealth().failureCount).toBe(1);
    });
  });

  describe('fetchOrderBook', () => {
    it('returns order book on success', async () => {
      const book = await provider.fetchOrderBook('binance', 'BTCUSDT');
      expect(book.symbol).toBe('BTCUSDT');
    });

    it('records failure and throws when adapter throws', async () => {
      vi.spyOn(PaperExchange.prototype, 'fetchOrderBook')
        .mockRejectedValueOnce(new Error('network timeout'));
      await expect(provider.fetchOrderBook('binance', 'BTCUSDT'))
        .rejects.toThrow('network timeout');
      expect(provider.getHealth().failureCount).toBe(1);
    });
  });

  describe('placeOrder', () => {
    it('executes market buy and records success', async () => {
      const result = await provider.placeOrder('binance', {
        symbol: 'BTCUSDT',
        side: 'buy', type: 'market', quantity: 0.01,
      });
      expect(result.status).toBe('filled');
      expect(provider.getHealth().failureCount).toBe(0);
    });

    it('credits profit on a winning sell (PnL > 0 branch)', async () => {
      vi.spyOn(PaperExchange.prototype, 'placeOrder').mockResolvedValueOnce({
        id: 'o1', exchangeId: 'binance', symbol: 'BTCUSDT',
        side: 'sell', type: 'market', price: 60000, quantity: 0.1,
        filled: 0.1, status: 'filled', fee: 0, timestamp: Date.now(), pnl: 500,
      });
      const result = await provider.placeOrder('binance', {
        symbol: 'BTCUSDT',
        side: 'sell', type: 'market', quantity: 0.1,
      });
      expect(result.status).toBe('filled');
    });

    it('records failure when adapter throws', async () => {
      vi.spyOn(PaperExchange.prototype, 'placeOrder')
        .mockRejectedValueOnce(new Error('insufficient balance'));
      await expect(provider.placeOrder('binance', {
        symbol: 'BTCUSDT',
        side: 'buy', type: 'market', quantity: 999,
      })).rejects.toThrow('insufficient balance');
      expect(provider.getHealth().failureCount).toBe(1);
    });
  });

  describe('cancelOrder', () => {
    it('cancels open limit order via placeOrder id', async () => {
      const placed = await provider.placeOrder('binance', {
        symbol: 'BTCUSDT',
        side: 'buy', type: 'limit', price: 50000, quantity: 0.01,
      });
      const ok = await provider.cancelOrder('binance', placed.id, 'BTCUSDT');
      expect(ok).toBe(true);
      expect(provider.getHealth().failureCount).toBe(0);
    });

    it('returns false for non-existent order', async () => {
      expect(await provider.cancelOrder('binance', 'ghost', 'BTCUSDT')).toBe(false);
    });

    it('records failure and throws when adapter rejects', async () => {
      vi.spyOn(PaperExchange.prototype, 'cancelOrder')
        .mockRejectedValueOnce(new Error('order already filled'));
      await expect(provider.cancelOrder('binance', 'x', 'BTCUSDT'))
        .rejects.toThrow('order already filled');
      expect(provider.getHealth().failureCount).toBe(1);
    });
  });

  describe('fetchOrder', () => {
    it('returns order result for placed limit order', async () => {
      const placed = await provider.placeOrder('binance', {
        symbol: 'BTCUSDT',
        side: 'buy', type: 'limit', price: 50000, quantity: 0.01,
      });
      const result = await provider.fetchOrder('binance', placed.id, 'BTCUSDT');
      expect(result.id).toBe(placed.id);
      expect(result.status).toBe('open');
    });

    it('records failure when getOrder returns undefined', async () => {
      vi.spyOn(PaperExchange.prototype, 'getOrder').mockReturnValueOnce(undefined);
      await provider.fetchOrder('binance', 'no-such-id', 'BTCUSDT').catch(() => {});
      expect(provider.getHealth().failureCount).toBe(1);
    });

    it('records failure and throws when adapter throws', async () => {
      vi.spyOn(PaperExchange.prototype, 'getOrder')
        .mockImplementationOnce(() => { throw new Error('db connection lost'); });
      await expect(provider.fetchOrder('binance', 'x', 'BTCUSDT'))
        .rejects.toThrow('db connection lost');
      expect(provider.getHealth().failureCount).toBe(1);
    });
  });

  describe('failure accumulation', () => {
    it('accumulates failures across different methods', async () => {
      vi.spyOn(PaperExchange.prototype, 'fetchOrderBook')
        .mockRejectedValueOnce(new Error('e1'));
      await provider.fetchOrderBook('binance', 'BTCUSDT').catch(() => {});
      expect(provider.getHealth().failureCount).toBe(1);
      vi.spyOn(PaperExchange.prototype, 'cancelOrder')
        .mockRejectedValueOnce(new Error('e2'));
      await provider.cancelOrder('binance', 'x', 'BTCUSDT').catch(() => {});
      expect(provider.getHealth().failureCount).toBe(2);
    });

    it('resets failure count on success after prior failures', async () => {
      vi.spyOn(PaperExchange.prototype, 'fetchOrderBook')
        .mockRejectedValueOnce(new Error('err'));
      await provider.fetchOrderBook('binance', 'BTCUSDT').catch(() => {});
      expect(provider.getHealth().failureCount).toBe(1);
      vi.spyOn(PaperExchange.prototype, 'fetchOrderBook').mockRestore();
      await provider.fetchOrderBook('binance', 'BTCUSDT');
      expect(provider.getHealth().failureCount).toBe(0);
    });
  });
});
