import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function makeOrchestrator(killswitch?: Killswitch): ExchangeOrchestrator {
  return new ExchangeOrchestrator({ killswitch });
}

describe('ExchangeOrchestrator — routed order affinity', () => {
  let orchestrator: ExchangeOrchestrator;
  let killswitch: Killswitch;

  beforeEach(() => {
    killswitch = new Killswitch({ onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() });
    orchestrator = makeOrchestrator(killswitch);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('pins order to exchange and routes cancel/fetch to same exchange', async () => {
    orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });

    // Use LIMIT order so it's open and cancellable (market orders fill instantly)
    const place = await orchestrator.routedPlaceOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantity: 0.001, price: 10000 });
    expect(place.ok).toBe(true);
    if (!place.ok) return;

    const orderId = place.data.id;
    const affinityExchange = orchestrator.getOrderAffinity(orderId);
    expect(affinityExchange).toBeDefined();

    // Cancel should succeed on the same exchange
    const cancel = await orchestrator.routedCancelOrder(orderId, 'BTC/USDT');
    expect(cancel.ok).toBe(true);
    if (cancel.ok) expect(cancel.data).toBe(true);

    // Fetch should also work on same exchange
    const fetch = await orchestrator.routedFetchOrder(orderId, 'BTC/USDT');
    expect(fetch.ok).toBe(true);
    if (fetch.ok) expect(fetch.data.id).toBe(orderId);
  });

  it('errors when cancel/fetch called without affinity (order never placed via routed)', async () => {
    orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });

    const cancel = await orchestrator.routedCancelOrder('nonexistent-order', 'BTC/USDT');
    expect(cancel.ok).toBe(false);
    if (!cancel.ok) expect(cancel.error).toContain('No affinity');

    const fetch = await orchestrator.routedFetchOrder('nonexistent-order', 'BTC/USDT');
    expect(fetch.ok).toBe(false);
    if (!fetch.ok) expect(fetch.error).toContain('No affinity');
  });

  it('order placed on binance stays on binance even if round-robin would pick bybit next', async () => {
    orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });

    // First order -> binance (round-robin start)
    const o1 = await orchestrator.routedPlaceOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001 });
    expect(o1.ok).toBe(true);
    if (!o1.ok) return;
    const affinity1 = orchestrator.getOrderAffinity(o1.data.id);
    expect(affinity1).toBe('binance');

    // Second order -> bybit (round-robin rotates)
    const o2 = await orchestrator.routedPlaceOrder({ symbol: 'ETH/USDT', side: 'buy', type: 'market', quantity: 0.001 });
    expect(o2.ok).toBe(true);
    if (!o2.ok) return;
    const affinity2 = orchestrator.getOrderAffinity(o2.data.id);
    expect(affinity2).toBe('bybit');

    // Cancel o1 should go to binance (not bybit)
    const cancel1 = await orchestrator.routedCancelOrder(o1.data.id, 'BTC/USDT');
    expect(cancel1.ok).toBe(true);

    // Cancel o2 should go to bybit
    const cancel2 = await orchestrator.routedCancelOrder(o2.data.id, 'ETH/USDT');
    expect(cancel2.ok).toBe(true);
  });
});
