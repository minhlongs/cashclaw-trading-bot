import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveExchange } from './index';
import type { OrderRequest } from '../types';

vi.mock('../rate-limiter', () => ({
  rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) },
}));

const OK_CLIENT = {
  fetchTicker: vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 50000 }),
  fetchOrderBook: vi.fn().mockResolvedValue({ bids: [], asks: [] }),
  fetchBalances: vi.fn().mockResolvedValue([]),
  placeOrder: vi.fn().mockResolvedValue({ id: '1', status: 'filled' }),
  cancelOrder: vi.fn().mockResolvedValue(true),
  fetchOrder: vi.fn().mockResolvedValue({ id: '1', status: 'filled' }),
  fetchOpenOrders: vi.fn().mockResolvedValue([]),
};

vi.mock('../ccxt/client', () => ({
  createCCXTClient: vi.fn().mockImplementation(() => ({ ...OK_CLIENT })),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

const EMPTY_CFG = { apiKey: '', apiSecret: '', testnet: false, sandbox: false, rateLimitMs: 0 };

function makeCallbacks() {
  return {
    isTradingEnabled: vi.fn().mockReturnValue(true),
    onOrderPlaced: vi.fn(),
    onOrderFilled: vi.fn(),
    onError: vi.fn(),
  };
}

const BUY: OrderRequest = { symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.01 };

describe('LiveExchange', () => {
  let ex: LiveExchange;
  let cb: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    cb = makeCallbacks();
    ex = new LiveExchange('binance', { apiKey: 'k', apiSecret: 's', testnet: false, sandbox: false, rateLimitMs: 1000 }, cb, {
      maxDailyLossPct: 10,
      maxOrdersPerMinute: 3,
    });
  });

  it('sets id and name from exchangeId', () => {
    expect(ex.id).toBe('binance');
    expect(ex.name).toBe('binance');
  });

  it('works with default options', () => {
    const e = new LiveExchange('binance', { apiKey: '', apiSecret: '', testnet: false, sandbox: false, rateLimitMs: 0 }, cb);
    expect(e.id).toBe('binance');
  });

  // --- passthrough methods ---
  it('fetchTicker returns ticker', async () => {
    const t = await ex.fetchTicker('BTC/USDT');
    expect(t.symbol).toBe('BTC/USDT');
  });

  it('fetchOrderBook returns order book', async () => {
    const b = await ex.fetchOrderBook('ETH/USDT');
    expect(b).toHaveProperty('bids');
  });

  it('fetchBalances returns array', async () => {
    expect(Array.isArray(await ex.fetchBalances())).toBe(true);
  });

  it('fetchOrder returns order result', async () => {
    expect((await ex.fetchOrder('1', 'BTC/USDT')).id).toBe('1');
  });

  it('fetchOpenOrders returns array', async () => {
    expect(Array.isArray(await ex.fetchOpenOrders('BTC/USDT'))).toBe(true);
  });

  it('getServerTime returns numeric timestamp', async () => {
    expect(await ex.getServerTime()).toBeGreaterThan(0);
  });

  // --- placeOrder ---
  it('places order and calls onOrderPlaced', async () => {
    const r = await ex.placeOrder(BUY);
    expect(r.id).toBe('1');
    expect(cb.onOrderPlaced).toHaveBeenCalled();
  });

  it('throws when killswitch off', async () => {
    cb.isTradingEnabled.mockReturnValue(false);
    await expect(ex.placeOrder(BUY)).rejects.toThrow('Trading halted by killswitch');
  });

  it('throws when daily loss limit reached', async () => {
    ex.updateDailyPnl(-0.15);
    await expect(ex.placeOrder(BUY)).rejects.toThrow(/Daily loss limit reached/);
  });

  it('throws when rate limit exceeded', async () => {
    for (let i = 0; i < 3; i++) await ex.placeOrder(BUY);
    await expect(ex.placeOrder(BUY)).rejects.toThrow(/Rate limit/);
  });

  it('calls onError when client throws', async () => {
    const { createCCXTClient } = await import('../ccxt/client');
    vi.mocked(createCCXTClient).mockReturnValueOnce({
      ...OK_CLIENT,
      placeOrder: vi.fn().mockRejectedValue(new Error('exchange down')),
    } as never);
    const e = new LiveExchange('binance', EMPTY_CFG, cb);
    await expect(e.placeOrder(BUY)).rejects.toThrow('exchange down');
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'exchange down' }), 'placeOrder');
  });

  // --- cancelOrder ---
  it('cancelOrder returns true on success', async () => {
    expect(await ex.cancelOrder('123', 'BTC/USDT')).toBe(true);
  });

  it('cancelOrder returns false and calls onError on failure', async () => {
    const { createCCXTClient } = await import('../ccxt/client');
    vi.mocked(createCCXTClient).mockReturnValueOnce({
      ...OK_CLIENT,
      cancelOrder: vi.fn().mockRejectedValue(new Error('cancel failed')),
    } as never);
    const e = new LiveExchange('binance', EMPTY_CFG, cb);
    expect(await e.cancelOrder('123', 'BTC/USDT')).toBe(false);
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'cancel failed' }), 'cancelOrder');
  });

  // --- ping ---
  it('ping returns true when exchange responds', async () => {
    expect(await ex.ping()).toBe(true);
  });

  it('ping returns false when exchange unreachable', async () => {
    const { createCCXTClient } = await import('../ccxt/client');
    vi.mocked(createCCXTClient).mockReturnValueOnce({
      ...OK_CLIENT,
      fetchTicker: vi.fn().mockRejectedValue(new Error('timeout')),
    } as never);
    const e = new LiveExchange('binance', EMPTY_CFG, cb);
    expect(await e.ping()).toBe(false);
  });

  // --- updateDailyPnl ---
  it('accumulates pnl under threshold without error', () => {
    ex.updateDailyPnl(-0.05);
    ex.updateDailyPnl(-0.03);
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('fires onError when absolute pnl exceeds maxDailyLoss', () => {
    ex.updateDailyPnl(-0.15);
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Daily loss limit breached') }),
      'dailyLossCheck',
    );
  });

  it('fires onError for positive pnl exceeding threshold', () => {
    ex.updateDailyPnl(0.5);
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Daily loss limit breached') }),
      'dailyLossCheck',
    );
  });

  // --- tick ---
  it('tick resets order count allowing more orders', async () => {
    for (let i = 0; i < 3; i++) await ex.placeOrder(BUY);
    await expect(ex.placeOrder(BUY)).rejects.toThrow(/Rate limit/);
    ex.tick();
    const r = await ex.placeOrder(BUY);
    expect(r.id).toBe('1');
  });
});
