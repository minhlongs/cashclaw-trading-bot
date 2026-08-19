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
    id: 'provider:binance:paper',
    name: 'binance',
    circuitBreaker: { getState: vi.fn().mockReturnValue('closed') },
    healthCheck: vi.fn().mockResolvedValue(true),
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
    getCircuitBreaker: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue('closed') }),
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
      const result = await orchestrator.fetchTicker('binance', 'BTC/USDT');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.symbol).toBe('BTC/USDT');
      }
    });

    it('delegates to registered provider', async () => {
      const provider = makeMockProvider() as any;
      orchestrator.registerProvider('binance', provider);

      const result = await orchestrator.fetchTicker('binance', 'BTC/USDT');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeDefined();
      }
      expect(provider.fetchTicker).toHaveBeenCalled();
    });
  });

  describe('fetchOrderBook', () => {
    it('creates auto-provider for unregistered exchange', async () => {
      const result = await orchestrator.fetchOrderBook('binance', 'BTC/USDT');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.symbol).toBe('BTC/USDT');
      }
    });
  });

  describe('killswitch integration', () => {
    it('blocks trading when killswitch disables', async () => {
      const ks = new Killswitch({ onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() });
      ks.disable();

      orchestrator = new ExchangeOrchestrator({ killswitch: ks, onError });

      const result = await orchestrator.placeOrder('binance', {
        symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Trading halted by killswitch');
      }
      expect(onError).toHaveBeenCalled();
    });

    it('allows trading when killswitch is default', async () => {
      const ks = new Killswitch({ onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() });
      orchestrator = new ExchangeOrchestrator({ killswitch: ks, onError });

      const result = await orchestrator.placeOrder('binance', {
        symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('filled');
      }
    });
  });

  describe('cancelOrder', () => {
    it('delegates to registered provider', async () => {
      const provider = makeMockProvider() as any;
      orchestrator.registerProvider('binance', provider);

      const result = await orchestrator.cancelOrder('binance', 'order-1', 'BTC/USDT');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe(true);
      }
      expect(provider.cancelOrder).toHaveBeenCalled();
    });
  });

  describe('fetchBalances', () => {
    it('auto-creates provider and fetches balances', async () => {
      const result = await orchestrator.fetchBalances('binance');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });
  });

  describe('error handling', () => {
    it('provider errors return err to caller', async () => {
      const provider = makeMockProvider() as any;
      provider.fetchTicker.mockRejectedValue(new Error('network'));
      orchestrator.registerProvider('binance', provider);

      const result = await orchestrator.fetchTicker('binance', 'BTC/USDT');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('network');
      }
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('provenance', () => {
    let ks: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      ks = vi.fn().mockReturnValue(true);
      orchestrator = new ExchangeOrchestrator({ onError, killswitch: { isTradingEnabled: ks } as never });
    });

    it('stores provenance after fetchTicker', async () => {
      await orchestrator.fetchTicker('binance', 'BTC/USDT');
      const provenance = orchestrator.getLastProvenance('binance');
      expect(provenance).toBeDefined();
      expect(provenance?.ok).toBe(true);
      expect(provenance?.provenance.provider).toBe('binance');
      expect(typeof provenance?.provenance.latencyMs).toBe('number');
    });

    it('stores provenance after placeOrder', async () => {
      await orchestrator.placeOrder('binance', {
        symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001,
      });
      const provenance = orchestrator.getLastProvenance('binance');
      expect(provenance).toBeDefined();
      expect(provenance?.ok).toBe(true);
      expect(provenance?.provenance.provider).toBe('binance');
    });

    it('returns undefined for unregistered exchange', () => {
      expect(orchestrator.getLastProvenance('unknown')).toBeUndefined();
    });
  });
});
