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

function makeOrchestrator(killswitch?: Killswitch, onError?: ReturnType<typeof vi.fn>) {
  return new ExchangeOrchestrator({ killswitch, onError });
}

/** Trip a provider's circuit breaker via real network-kind failures (threshold: 2). */
async function tripCircuit(provider: PaperExchangeProvider): Promise<void> {
  for (let i = 0; i < 5 && !provider.isCircuitOpen(); i += 1) {
    await provider.getCircuitBreaker().execute(() => Promise.reject(new Error('econnrefused'))).catch(() => undefined);
  }
}

describe('ExchangeOrchestrator — routed execution', () => {
  let orchestrator: ExchangeOrchestrator;
  let onError: ReturnType<typeof vi.fn>;
  let killswitch: Killswitch;

  beforeEach(() => {
    onError = vi.fn();
    killswitch = new Killswitch({ onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() });
    orchestrator = makeOrchestrator(killswitch, onError);
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
      // First routed call materializes providers for all configured exchanges
      const first = await orchestrator.routedFetchTicker('BTC/USDT');
      expect(first.ok).toBe(true);

      // Trip both circuits via real network-kind failures (threshold 2 → degraded → open)
      const binance = orchestrator.getProvider('binance');
      const bybit = orchestrator.getProvider('bybit');
      expect(binance).toBeDefined();
      expect(bybit).toBeDefined();
      if (binance) await tripCircuit(binance);
      if (bybit) await tripCircuit(bybit);
      expect(binance?.isCircuitOpen()).toBe(true);
      expect(bybit?.isCircuitOpen()).toBe(true);

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

});