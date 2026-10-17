import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CCXTTransformer, createCCXTClient } from './client';

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

function rawBalanceMap(currencies: Record<string, { free: number; used: number; total: number }>) {
  const free: Record<string, number> = {};
  const used: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const [currency, info] of Object.entries(currencies)) {
    free[currency] = info.free;
    used[currency] = info.used;
    total[currency] = info.total;
  }
  return { free, used, total };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CCXTTransformer — balances, open orders & factory', () => {
  describe('fetchBalances', () => {
    it('transforms CCXT balance to BalanceEntry array', async () => {
      mocks.fetchBalance.mockResolvedValueOnce(
        rawBalanceMap({
          USDT: { free: 5000, used: 5000, total: 10000 },
          BTC: { free: 0.2, used: 0.3, total: 0.5 },
        }),
      );
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.fetchBalances('binance');

      expect(result).toEqual([
        { currency: 'USDT', free: 5000, used: 5000, total: 10000 },
        { currency: 'BTC', free: 0.2, used: 0.3, total: 0.5 },
      ]);
    });

    it('filters out zero-balance currencies', async () => {
      mocks.fetchBalance.mockResolvedValueOnce(
        rawBalanceMap({
          USDT: { free: 100, used: 0, total: 100 },
          DOGE: { free: 0, used: 0, total: 0 },
        }),
      );
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.fetchBalances('binance');
      expect(result).toHaveLength(1);
      expect(result[0].currency).toBe('USDT');
    });

    it('returns empty array for empty balance', async () => {
      mocks.fetchBalance.mockResolvedValueOnce(rawBalanceMap({}));
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.fetchBalances('binance');
      expect(result).toEqual([]);
    });

    it('propagates balance fetch errors', async () => {
      mocks.fetchBalance.mockRejectedValueOnce(new Error('Auth failed'));
      const client = new CCXTTransformer({ exchange: 'binance' });
      await expect(client.fetchBalances('binance')).rejects.toThrow('Auth failed');
    });
  });

  describe('fetchOpenOrders', () => {
    it('transforms open orders to OrderResult array', async () => {
      mocks.fetchOpenOrders.mockResolvedValueOnce([
        rawOrder({ id: 'o1', status: 'open', filled: 0 }),
        rawOrder({ id: 'o2', status: 'open', filled: 0, symbol: 'ETH/USDT' }),
      ]);
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.fetchOpenOrders('binance', 'BTC/USDT');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('o1');
      expect(result[0].status).toBe('open');
      expect(result[1].id).toBe('o2');
      expect(result[1].symbol).toBe('ETH/USDT');
      expect(mocks.fetchOpenOrders).toHaveBeenCalledWith('BTC/USDT');
    });

    it('returns empty array when no open orders', async () => {
      mocks.fetchOpenOrders.mockResolvedValueOnce([]);
      const client = new CCXTTransformer({ exchange: 'binance' });
      const result = await client.fetchOpenOrders('binance', 'BTC/USDT');
      expect(result).toEqual([]);
    });

    it('propagates fetch open orders errors', async () => {
      mocks.fetchOpenOrders.mockRejectedValueOnce(new Error('Rate limit'));
      const client = new CCXTTransformer({ exchange: 'binance' });
      await expect(client.fetchOpenOrders('binance', 'BTC/USDT')).rejects.toThrow('Rate limit');
    });
  });

  describe('createCCXTClient', () => {
    it('returns a CCXTTransformer instance', () => {
      const client = createCCXTClient('binance', { apiKey: 'key', apiSecret: 'secret', sandbox: false });
      expect(client).toBeInstanceOf(CCXTTransformer);
    });

    it('works with minimal config', () => {
      const client = createCCXTClient('bybit');
      expect(client).toBeInstanceOf(CCXTTransformer);
    });
  });
});
