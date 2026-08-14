import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExchangeOrchestrator } from './index';
import { Killswitch } from '@/tree/bot/killswitch';

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

function makeMockProvider() {
  return {
    fetchTicker: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT', last: 50000, bid: 49990, ask: 50010,
      high24h: 52000, low24h: 48000, volume24h: 1000, timestamp: Date.now(),
    }),
    fetchOrderBook: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT', bids: [[49990, 1]], asks: [[50010, 1]], timestamp: Date.now(),
    }),
    placeOrder: vi.fn().mockResolvedValue({
      id: 'order-1', exchangeId: 'binance', symbol: 'BTC/USDT',
      side: 'buy', type: 'market', price: 50000, quantity: 0.001,
      filled: 0.001, status: 'filled', timestamp: Date.now(),
    }),
    cancelOrder: vi.fn().mockResolvedValue(true),
    fetchOrder: vi.fn().mockResolvedValue({
      id: 'order-1', exchangeId: 'binance', symbol: 'BTC/USDT',
      side: 'buy', type: 'market', price: 50000, quantity: 0.001,
      filled: 0.001, status: 'filled', timestamp: Date.now(),
    }),
    fetchBalances: vi.fn().mockResolvedValue([
      { asset: 'USDT', free: 10000, used: 0, total: 10000 },
    ]),
    isCircuitOpen: vi.fn().mockReturnValue(false),
    isUnhealthy: vi.fn().mockReturnValue(false),
  };
}

describe('ExchangeOrchestrator', () => {
  let orchestrator: ExchangeOrchestrator;
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onError = vi.fn();
    orchestrator = new ExchangeOrchestrator({ onError });
  });

  describe('provider management', () => {
    it('registers and retrieves a provider', () => {
      const provider = makeMockProvider() as any;
      orchestrator.registerProvider('binance', provider);
      expect(orchestrator.getProvider('binance')).toBe(provider);
    });

    it('returns undefined for unregistered provider', () => {
      expect(orchestrator.getProvider('unknown')).toBeUndefined();
    });
  });

  describe('fetchTicker', () => {
    it('creates auto-provider for unregistered exchange', async () => {
      const ticker = await orchestrator.fetchTicker('binance', 'BTC/USDT');
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('BTC/USDT');
    });

    it('delegates to registered provider', async () => {
      const provider = makeMockProvider() as any;
      orchestrator.registerProvider('binance', provider);

      const ticker = await orchestrator.fetchTicker('binance', 'BTC/USDT');
      expect(ticker).toBeDefined();
      expect(provider.fetchTicker).toHaveBeenCalled();
    });
  });

  describe('fetchOrderBook', () => {
    it('creates auto-provider for unregistered exchange', async () => {
      const book = await orchestrator.fetchOrderBook('binance', 'BTC/USDT');
      expect(book).toBeDefined();
      expect(book.symbol).toBe('BTC/USDT');
    });
  });

  describe('killswitch integration', () => {
    it('blocks trading when killswitch disables', async () => {
      const ks = new Killswitch({ onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() });
      ks.disable();

      orchestrator = new ExchangeOrchestrator({ killswitch: ks, onError });

      await expect(
        orchestrator.placeOrder('binance', {
          symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001,
        }),
      ).rejects.toThrow();
    });

    it('allows trading when killswitch is default', async () => {
      const ks = new Killswitch({ onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() });
      orchestrator = new ExchangeOrchestrator({ killswitch: ks, onError });

      const result = await orchestrator.placeOrder('binance', {
        symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('filled');
    });
  });

  describe('cancelOrder', () => {
    it('delegates to registered provider', async () => {
      const provider = makeMockProvider() as any;
      orchestrator.registerProvider('binance', provider);

      const result = await orchestrator.cancelOrder('binance', 'order-1', 'BTC/USDT');
      expect(result).toBe(true);
      expect(provider.cancelOrder).toHaveBeenCalled();
    });
  });

  describe('fetchBalances', () => {
    it('auto-creates provider and fetches balances', async () => {
      const balances = await orchestrator.fetchBalances('binance');
      expect(balances).toBeDefined();
      expect(balances.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('provider errors throw to caller', async () => {
      const provider = makeMockProvider() as any;
      provider.fetchTicker.mockRejectedValue(new Error('network'));
      orchestrator.registerProvider('binance', provider);

      await expect(
        orchestrator.fetchTicker('binance', 'BTC/USDT'),
      ).rejects.toThrow('network');
      expect(onError).toHaveBeenCalled();
    });
  });
});
