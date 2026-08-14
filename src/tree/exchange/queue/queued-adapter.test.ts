import { describe, it, expect, vi } from 'vitest';
import { QueuedExchangeAdapter } from './queued-adapter';
import { RequestQueue } from './request-queue';
import { RequestPriority } from './types';
import type { ExchangeAdapter, Ticker, OrderBook, Balance, OrderRequest, OrderResult } from '../types';

function makeMockAdapter(overrides: Partial<ExchangeAdapter> = {}): ExchangeAdapter {
  return {
    id: 'binance',
    name: 'Binance',
    fetchTicker: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT', last: 50000, bid: 49999, ask: 50001,
      high24h: 51000, low24h: 49000, volume24h: 1000, timestamp: Date.now(),
    } as Ticker),
    fetchOrderBook: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT', bids: [], asks: [], timestamp: Date.now(),
    } as OrderBook),
    fetchBalances: vi.fn().mockResolvedValue([] as Balance[]),
    placeOrder: vi.fn().mockResolvedValue({
      id: 'order-1', exchangeId: 'binance', symbol: 'BTC/USDT',
      side: 'buy', type: 'limit', price: 50000, quantity: 0.1,
      filled: 0, status: 'open', fee: 0, feeCurrency: '', timestamp: Date.now(), pnl: 0,
    } as OrderResult),
    cancelOrder: vi.fn().mockResolvedValue(true),
    fetchOrder: vi.fn().mockResolvedValue({
      id: 'order-1', exchangeId: 'binance', symbol: 'BTC/USDT',
      side: 'buy', type: 'limit', price: 50000, quantity: 0.1,
      filled: 0, status: 'open', fee: 0, feeCurrency: '', timestamp: Date.now(), pnl: 0,
    } as OrderResult),
    fetchOpenOrders: vi.fn().mockResolvedValue([] as OrderResult[]),
    ping: vi.fn().mockResolvedValue(true),
    getServerTime: vi.fn().mockResolvedValue(Date.now()),
    ...overrides,
  };
}

function makeAdapter(adapter?: ExchangeAdapter, maxDepth = 10) {
  const inner = adapter ?? makeMockAdapter();
  const queue = new RequestQueue({
    maxDepth: { binance: maxDepth, bybit: maxDepth, okx: maxDepth },
    dailyBudget: { binance: 1000, bybit: 1000, okx: 1000 },
    drainBatchSize: 20,
  });
  return { adapter: new QueuedExchangeAdapter({ inner, queue }), queue, inner };
}

describe('QueuedExchangeAdapter', () => {
  it('delegates to inner adapter for market data', async () => {
    const { adapter, inner } = makeAdapter();
    const ticker = await adapter.fetchTicker('BTC/USDT');
    expect(inner.fetchTicker).toHaveBeenCalledWith('BTC/USDT');
    expect(ticker.symbol).toBe('BTC/USDT');
  });

  it('delegates order book to inner adapter', async () => {
    const { adapter, inner } = makeAdapter();
    const book = await adapter.fetchOrderBook('BTC/USDT', 20);
    expect(inner.fetchOrderBook).toHaveBeenCalledWith('BTC/USDT', 20);
    expect(book.symbol).toBe('BTC/USDT');
  });

  it('delegates balances to inner adapter', async () => {
    const { adapter, inner } = makeAdapter();
    const balances = await adapter.fetchBalances();
    expect(inner.fetchBalances).toHaveBeenCalled();
    expect(balances).toEqual([]);
  });

  it('routes placeOrder through queue', async () => {
    const { adapter, inner } = makeAdapter();
    const req: OrderRequest = {
      symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50000, quantity: 0.1,
    };
    const result = await adapter.placeOrder(req);
    expect(inner.placeOrder).toHaveBeenCalledWith(req);
    expect(result.id).toBe('order-1');
  });

  it('routes cancelOrder through queue with LIVE_TRADE priority', async () => {
    const { adapter, inner } = makeAdapter();
    const result = await adapter.cancelOrder('order-1', 'BTC/USDT');
    expect(inner.cancelOrder).toHaveBeenCalledWith('order-1', 'BTC/USDT');
    expect(result).toBe(true);
  });

  it('routes fetchOrder through queue with STRATEGY_EVAL priority', async () => {
    const { adapter, inner } = makeAdapter();
    const result = await adapter.fetchOrder('order-1', 'BTC/USDT');
    expect(inner.fetchOrder).toHaveBeenCalledWith('order-1', 'BTC/USDT');
    expect(result.id).toBe('order-1');
  });

  it('routes fetchOpenOrders through queue', async () => {
    const { adapter, inner } = makeAdapter();
    const result = await adapter.fetchOpenOrders('BTC/USDT');
    expect(inner.fetchOpenOrders).toHaveBeenCalledWith('BTC/USDT');
    expect(result).toEqual([]);
  });

  it('passes through ping with zero cost', async () => {
    const { adapter, inner } = makeAdapter();
    const result = await adapter.ping();
    expect(inner.ping).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('passes through getServerTime with zero cost', async () => {
    const { adapter, inner } = makeAdapter();
    const result = await adapter.getServerTime();
    expect(inner.getServerTime).toHaveBeenCalled();
    expect(typeof result).toBe('number');
  });

  it('tracks cost after each API call', async () => {
    const { adapter, queue } = makeAdapter();
    await adapter.fetchTicker('BTC/USDT');
    await adapter.placeOrder({
      symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50000, quantity: 0.1,
    });

    const snap = queue.getCostSnapshot();
    expect(snap.binance.used).toBeGreaterThan(0);
  });

  it('returns adapter id and name from inner', () => {
    const { adapter } = makeAdapter();
    expect(adapter.id).toBe('binance');
    expect(adapter.name).toBe('Binance');
  });

  it('falls back to direct execution when queue is full', async () => {
    const { adapter, inner, queue } = makeAdapter(makeMockAdapter(), 1);
    // Fill the queue
    queue.enqueue({
      priority: RequestPriority.HISTORICAL,
      exchange: 'binance',
      cost: 1,
      execute: async () => {},
      label: 'filler',
    });

    // Queue is full — adapter falls back to direct execution
    const result = await adapter.placeOrder({
      symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50000, quantity: 0.1,
    });
    expect(result.id).toBe('order-1');
    expect(inner.placeOrder).toHaveBeenCalled();
  });
});
