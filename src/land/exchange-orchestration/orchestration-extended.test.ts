// orchestration-extended.test.ts — cover placeOrder, cancelOrder, fetchOrder, fetchBalances, singletons
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExchangeOrchestrator,
  getExchangeOrchestrator,
  resetExchangeOrchestrator,
} from './index';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function mkKillswitch(overrides: Record<string, unknown> = {}) {
  return {
    isTradingEnabled: vi.fn().mockReturnValue(true),
    haltReason: null,
    check: vi.fn(),
    halt: vi.fn(),
    resume: vi.fn(),
    ...overrides,
  } as unknown as import('@/tree/bot/killswitch').Killswitch;
}

function mkProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'provider:binance:paper',
    name: 'binance',
    circuitBreaker: { getState: vi.fn().mockReturnValue('closed') },
    healthCheck: vi.fn().mockResolvedValue(true),
    fetchTicker: vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 50000 }),
    fetchOrderBook: vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', bids: [], asks: [], timestamp: 1 }),
    placeOrder: vi.fn().mockResolvedValue({ id: 'o1', status: 'filled' }),
    cancelOrder: vi.fn().mockResolvedValue(true),
    fetchOrder: vi.fn().mockResolvedValue({ id: 'o1', status: 'filled' }),
    fetchBalances: vi.fn().mockResolvedValue([{ currency: 'USDT', free: 1000 }]),
    getHealth: vi.fn().mockReturnValue({ score: 100, failureCount: 0 }),
    isCircuitOpen: vi.fn().mockReturnValue(false),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    isUnhealthy: vi.fn().mockReturnValue(false),
    getCircuitBreaker: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue('closed') }),
    ...overrides,
  };
}

describe('ExchangeOrchestrator extended', () => {
  let orch: ExchangeOrchestrator;
  let onError: ReturnType<typeof vi.fn>;
  let ks: ReturnType<typeof mkKillswitch>;

  beforeEach(() => {
    onError = vi.fn();
    ks = mkKillswitch();
    orch = new ExchangeOrchestrator({ onError, killswitch: ks });
  });

  afterEach(() => orch.destroy());

  it('fetchOrderBook returns book from provider', async () => {
    const p = mkProvider();
    orch.registerProvider('binance', p as never);
    const result = await orch.fetchOrderBook('binance', 'BTC/USDT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.symbol).toBe('BTC/USDT');
    }
  });

  it('fetchOrderBook reports error on failure', async () => {
    orch.registerProvider('binance', mkProvider({ fetchOrderBook: vi.fn().mockRejectedValue(new Error('depth')) }) as never);
    const result = await orch.fetchOrderBook('binance', 'BTC/USDT');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('depth');
    }
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'fetchOrderBook/BTC/USDT');
  });

  it('fetchOrder returns order from provider', async () => {
    orch.registerProvider('binance', mkProvider() as never);
    const result = await orch.fetchOrder('binance', 'o1', 'BTC/USDT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('o1');
    }
  });

  it('fetchOrder reports error on failure', async () => {
    orch.registerProvider('binance', mkProvider({ fetchOrder: vi.fn().mockRejectedValue(new Error('nf')) }) as never);
    const result = await orch.fetchOrder('binance', 'o1', 'BTC/USDT');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('nf');
    }
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'fetchOrder/o1');
  });

  it('cancelOrder delegates to provider', async () => {
    orch.registerProvider('binance', mkProvider() as never);
    const result = await orch.cancelOrder('binance', 'o1', 'BTC/USDT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(true);
    }
  });

  it('cancelOrder reports error on failure', async () => {
    orch.registerProvider('binance', mkProvider({ cancelOrder: vi.fn().mockRejectedValue(new Error('fail')) }) as never);
    const result = await orch.cancelOrder('binance', 'o1', 'BTC/USDT');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fail');
    }
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'cancelOrder/o1');
  });

  it('fetchBalances returns array from provider', async () => {
    orch.registerProvider('binance', mkProvider() as never);
    const result = await orch.fetchBalances('binance');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
    }
  });

  it('fetchBalances reports error on failure', async () => {
    orch.registerProvider('binance', mkProvider({ fetchBalances: vi.fn().mockRejectedValue(new Error('bal')) }) as never);
    const result = await orch.fetchBalances('binance');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('bal');
    }
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'fetchBalances/binance');
  });

  it('placeOrder delegates to registered provider', async () => {
    orch.registerProvider('binance', mkProvider({ placeOrder: vi.fn().mockResolvedValue({ id: 'o2', status: 'filled' }) }) as never);
    const result = await orch.placeOrder('binance', { symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('o2');
    }
  });

  it('placeOrder returns err when killswitch disables trading', async () => {
    const localKs = mkKillswitch({
      isTradingEnabled: vi.fn().mockReturnValue(false),
      haltReason: 'daily limit',
    });
    const o = new ExchangeOrchestrator({ onError, killswitch: localKs });
    o.registerProvider('binance', mkProvider() as never);
    const result = await o.placeOrder('binance', { symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Trading halted by killswitch');
    }
    expect(onError).toHaveBeenCalled();
    o.destroy();
  });

  it('placeOrder returns err when circuit breaker is open', async () => {
    orch.registerProvider('binance', mkProvider({ isCircuitOpen: vi.fn().mockReturnValue(true) }) as never);
    const result = await orch.placeOrder('binance', { symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Trading paused');
    }
    expect(onError).toHaveBeenCalled();
  });

  it('placeOrder reports and returns err on provider failure', async () => {
    orch.registerProvider('binance', mkProvider({ placeOrder: vi.fn().mockRejectedValue(new Error('funds')) }) as never);
    const result = await orch.placeOrder('binance', { symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('funds');
    }
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'placeOrder/BTC/USDT');
  });

  it('reportError is resilient when onError throws', async () => {
    const throwingCb = vi.fn(() => { throw new Error('cb'); });
    const o = new ExchangeOrchestrator({ onError: throwingCb, killswitch: mkKillswitch() });
    o.registerProvider('binance', mkProvider({ fetchTicker: vi.fn().mockRejectedValue(new Error('net')) }) as never);
    const result = await o.fetchTicker('binance', 'BTC/USDT');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('net');
    }
    o.destroy();
  });

  // ── provenance ──────────────────────────────────────────────────────────────
  it('stores provenance after fetchTicker', async () => {
    orch.registerProvider('binance', mkProvider() as never);
    await orch.fetchTicker('binance', 'BTC/USDT');
    const provenance = orch.getLastProvenance('binance');
    expect(provenance).toBeDefined();
    expect(provenance?.ok).toBe(true);
    expect(provenance?.provenance.provider).toBe('binance');
    expect(typeof provenance?.provenance.latencyMs).toBe('number');
  });

  it('stores provenance after placeOrder', async () => {
    orch.registerProvider('binance', mkProvider() as never);
    await orch.placeOrder('binance', { symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.1 });
    const provenance = orch.getLastProvenance('binance');
    expect(provenance).toBeDefined();
    expect(provenance?.ok).toBe(true);
    expect(provenance?.provenance.provider).toBe('binance');
  });

  it('returns undefined for unregistered exchange', () => {
    expect(orch.getLastProvenance('unknown')).toBeUndefined();
  });

  // ── singleton ──────────────────────────────────────────────────────────────
  it('getExchangeOrchestrator returns same instance', () => {
    const a = getExchangeOrchestrator({ onError });
    const b = getExchangeOrchestrator({ onError: vi.fn() });
    expect(a).toBe(b);
  });

  it('resetExchangeOrchestrator clears singleton', () => {
    const a = getExchangeOrchestrator();
    resetExchangeOrchestrator();
    const b = getExchangeOrchestrator();
    expect(a).not.toBe(b);
  });

  it('resetExchangeOrchestrator is safe to call when null', () => {
    resetExchangeOrchestrator();
    expect(() => resetExchangeOrchestrator()).not.toThrow();
  });
});
