import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaperExchangeProvider } from './paper-provider';
import type { PaperProviderConfig } from './types';

const makeConfig = (overrides?: Partial<PaperProviderConfig>): PaperProviderConfig => ({
  type: 'paper',
  exchangeId: 'binance',
  initialBalances: [
    { currency: 'USDT', total: 10000 },
    { currency: 'BTC', total: 0.5 },
  ],
  ...overrides,
});

describe('PaperExchangeProvider', () => {
  let provider: PaperExchangeProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new PaperExchangeProvider(makeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts healthy with score 100', () => {
    const health = provider.getHealth();
    expect(health.score).toBe(100);
    expect(health.failureCount).toBe(0);
  });

  it('degrades after consecutive failures', () => {
    // 1st failure: score drops by 15 → 85
    provider.recordFailure();
    let h = provider.getHealth();
    expect(h.score).toBe(85);
    expect(h.failureCount).toBe(1);

    // 2nd failure: score drops by 15 → 70
    provider.recordFailure();
    h = provider.getHealth();
    expect(h.score).toBe(70);
    expect(h.failureCount).toBe(2);

    // 3rd failure: score drops by 15 → 55
    provider.recordFailure();
    h = provider.getHealth();
    expect(h.score).toBe(55);
    expect(h.failureCount).toBe(3);

    // Still not unhealthy at score 55 (threshold is 40)
    expect(provider.isUnhealthy()).toBe(false);

    // 4th and 5th failure: score → 25 (< 40 → unhealthy)
    provider.recordFailure();
    provider.recordFailure();
    h = provider.getHealth();
    expect(h.score).toBe(25);
    expect(h.failureCount).toBe(5);
    expect(provider.isUnhealthy()).toBe(true);
  });

  it('recovers health on success', () => {
    provider.recordFailure();
    provider.recordFailure();
    provider.recordFailure();
    const degradedScore = provider.getHealth().score;

    provider.recordSuccess(50);
    const health = provider.getHealth();
    expect(health.failureCount).toBe(0);
    expect(health.score).toBeGreaterThan(degradedScore);
  });

  it('returns config copy', () => {
    const config = provider.getConfig();
    expect(config.type).toBe('paper');
    expect(config.exchangeId).toBe('binance');
    // Mutating returned config shouldn't affect provider
    config.initialBalances = [];
    expect(provider.getConfig().initialBalances).toHaveLength(2);
  });

  it('returns budget from tradingLimits', () => {
    const budget = provider.getBudget();
    expect(budget.reqPerMin).toBe(100);
    expect(budget.reqPerHour).toBe(5000);
  });

  it('uses defaults when tradingLimits not provided', () => {
    const p = new PaperExchangeProvider(makeConfig({ tradingLimits: undefined }));
    const budget = p.getBudget();
    expect(budget.reqPerMin).toBe(100);
    expect(budget.reqPerHour).toBe(5000);
  });

  it('tracks latency via recordSuccess', () => {
    provider.recordSuccess(100);
    provider.recordSuccess(200);
    const health = provider.getHealth();
    // EMA: 0.3*200 + 0.7*100 = 60 + 70 = 130
    expect(Math.round(health.latencyMs)).toBe(130);
  });

  it('backoff escalates on repeated failures', () => {
    expect(provider.getBackoffMs()).toBe(0);

    provider.recordFailure();
    expect(provider.getBackoffMs()).toBeGreaterThan(0);

    // After cooldown expires, backoff resets
    vi.advanceTimersByTime(2000);
    expect(provider.getBackoffMs()).toBe(0);
  });
});

describe('PaperExchangeProvider — API wrappers', () => {
  let provider: PaperExchangeProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new PaperExchangeProvider(makeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetchTicker delegates to adapter and records success', async () => {
    const ticker = await provider.fetchTicker('binance', 'BTCUSDT');
    expect(ticker.symbol).toBe('BTCUSDT');
    expect(provider.getHealth().failureCount).toBe(0);
  });

  it('fetchBalances returns balances from adapter', async () => {
    const balances = await provider.fetchBalances('binance');
    expect(balances).toHaveLength(2);
  });

  it('isCircuitOpen is false initially', () => {
    expect(provider.isCircuitOpen()).toBe(false);
  });
});

describe('PaperExchangeProvider — circuit breaker integration', () => {
  let provider: PaperExchangeProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new PaperExchangeProvider(makeConfig({
      initialBalances: [{ currency: 'USDT', total: 1 }],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('trips circuit breaker after 3 consecutive adapter failures', async () => {
    // PaperExchange.placeOrder never throws, so we mock the adapter's method
    const adapter = (provider as unknown as { adapter: { fetchTicker: () => Promise<never> } }).adapter;
    const origFetchTicker = adapter.fetchTicker.bind(adapter);

    let callCount = 0;
    adapter.fetchTicker = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 3) {
        throw new Error('simulated failure');
      }
      return origFetchTicker();
    });

    // 3 consecutive failures via the provider wrapper (through circuit breaker)
    for (let i = 0; i < 3; i++) {
      try {
        await provider.fetchTicker('binance', 'BTCUSDT');
      } catch {
        // expected failures
      }
    }

    expect(provider.isCircuitOpen()).toBe(true);

    // Next call should throw CircuitOpenError (not go to adapter)
    await expect(provider.fetchTicker('binance', 'BTCUSDT')).rejects.toThrow('circuit_open');
  });

  it('half-open after cooldown → success closes circuit', async () => {
    // Trip the breaker first
    const adapter = (provider as unknown as { adapter: { fetchTicker: () => Promise<never> } }).adapter;
    let callCount = 0;
    adapter.fetchTicker = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 3) {
        throw new Error('simulated failure');
      }
      return { symbol: 'BTCUSDT', last: 50000, bid: 49999, ask: 50001, high24h: 51000, low24h: 49000, volume24h: 1000, timestamp: Date.now() };
    });

    for (let i = 0; i < 3; i++) {
      try { await provider.fetchTicker('binance', 'BTCUSDT'); } catch { /* expected */ }
    }
    expect(provider.isCircuitOpen()).toBe(true);

    // Advance past cooldown (co=60s, halfOpen=30s → total ~90s)
    vi.advanceTimersByTime(91_000);

    // Now half-open — one trial call succeeds → circuit closes
    const result = await provider.fetchTicker('binance', 'BTCUSDT');
    expect(result.symbol).toBe('BTCUSDT');
    expect(provider.isCircuitOpen()).toBe(false);
  });
});
