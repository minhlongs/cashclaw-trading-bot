import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExchangeOrchestrator } from './index';
import { Killswitch } from '@/tree/bot/killswitch';
import { PaperExchangeProvider } from '@/tree/exchange/provider';

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

function makeOrchestrator(killswitch?: Killswitch) {
  return new ExchangeOrchestrator({ killswitch, onError: vi.fn() });
}

describe('ExchangeOrchestrator — routed execution', () => {
  let orchestrator: ExchangeOrchestrator;
  let onError: ReturnType<typeof vi.fn>;
  let killswitch: Killswitch;

  beforeEach(() => {
    onError = vi.fn();
    killswitch = new Killswitch({ onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() });
    orchestrator = makeOrchestrator(killswitch);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('configureRouting', () => {
    it('accepts valid round-robin config', () => {
      const result = orchestrator.configureRouting({
        strategy: 'round-robin',
        exchanges: ['binance', 'bybit', 'okx'],
      });
      expect(result.ok).toBe(true);
    });

    it('accepts valid pinned config', () => {
      const result = orchestrator.configureRouting({
        strategy: 'pinned',
        exchanges: ['binance', 'bybit'],
        pinnedExchange: 'binance',
      });
      expect(result.ok).toBe(true);
    });

    it('rejects invalid config (empty exchanges)', () => {
      const result = orchestrator.configureRouting({
        strategy: 'round-robin',
        exchanges: [],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('at least 1');
    });

    it('rejects invalid config (pinned without pinnedExchange)', () => {
      const result = orchestrator.configureRouting({
        strategy: 'pinned',
        exchanges: ['binance'],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('pinned');
    });

    it('rejects pinnedExchange not in exchanges list', () => {
      const result = orchestrator.configureRouting({
        strategy: 'pinned',
        exchanges: ['binance'],
        pinnedExchange: 'okx',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('pinned');
    });

    it('rejects unknown exchange id', () => {
      const result = orchestrator.configureRouting({
        strategy: 'round-robin',
        exchanges: ['binance', 'kraken'],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('kraken');
    });
  });

  describe('routedFetchTicker', () => {
    it('errors when routing not configured', async () => {
      const result = await orchestrator.routedFetchTicker('BTC/USDT');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Routing not configured');
    });

    it('errors with explicit message when all exchanges circuit-open', async () => {
      orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });
      // Manually open circuit on both
      const b = orchestrator.getProvider('binance');
      const bb = orchestrator.getProvider('bybit');
      if (b) b.recordFailure(); b?.recordFailure(); b?.recordFailure(); // trip circuit
      if (bb) bb.recordFailure(); bb?.recordFailure(); bb?.recordFailure();

      const result = await orchestrator.routedFetchTicker('BTC/USDT');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('circuit-open');
    });

    it('round-robin distributes across configured exchanges (provenance tracks exchange)', async () => {
      orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit', 'okx'] });

      const r1 = await orchestrator.routedFetchTicker('BTC/USDT');
      expect(r1.ok).toBe(true);
      const p1 = orchestrator.getLastProvenance('binance');
      expect(p1).toBeDefined();
      expect(p1?.provenance.provider).toBe('binance');

      const r2 = await orchestrator.routedFetchTicker('ETH/USDT');
      expect(r2.ok).toBe(true);
      const p2 = orchestrator.getLastProvenance('bybit');
      expect(p2).toBeDefined();
      expect(p2?.provenance.provider).toBe('bybit');

      const r3 = await orchestrator.routedFetchTicker('SOL/USDT');
      expect(r3.ok).toBe(true);
      const p3 = orchestrator.getLastProvenance('okx');
      expect(p3).toBeDefined();
      expect(p3?.provenance.provider).toBe('okx');
    });
  });

  describe('routedPlaceOrder — killswitch guard', () => {
    it('blocks when killswitch disabled', async () => {
      killswitch.disable();
      orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });

      const result = await orchestrator.routedPlaceOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Trading halted by killswitch');
      expect(onError).toHaveBeenCalled();
    });

    it('allows when killswitch enabled', async () => {
      orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });

      const result = await orchestrator.routedPlaceOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBeDefined();
        expect(result.data.exchangeId).toBeDefined();
      }
    });
  });

  describe('routedPlaceOrder — order affinity', () => {
    it('pins order to exchange and routes cancel/fetch to same exchange', async () => {
      orchestrator.configureRouting({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });

      const place = await orchestrator.routedPlaceOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001 });
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
  });

  describe('routedPlaceOrder — affinity overrides round-robin rotation', () => {
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
});