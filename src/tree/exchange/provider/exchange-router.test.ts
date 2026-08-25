import { describe, it, expect } from 'vitest';
import { ExchangeRouter, type RouteContext } from './exchange-router';
import type { RoutingConfig } from './routing-types';
import type { ExchangeId } from '../types';

const ALL: ExchangeId[] = ['binance', 'bybit', 'okx'];

function ctx(overrides: Partial<Record<ExchangeId, { score: number; circuitOpen: boolean }>> = {}): RouteContext {
  const health = new Map<ExchangeId, { score: number; circuitOpen: boolean }>();
  for (const exchange of ALL) {
    health.set(exchange, overrides[exchange] ?? { score: 100, circuitOpen: false });
  }
  return { health };
}

const roundRobin: RoutingConfig = { strategy: 'round-robin', exchanges: ALL };
const bestHealth: RoutingConfig = { strategy: 'best-health', exchanges: ALL };
const pinnedBinance: RoutingConfig = { strategy: 'pinned', exchanges: ALL, pinnedExchange: 'binance' };

describe('ExchangeRouter — pinned', () => {
  it('always returns the pinned exchange when healthy', () => {
    const router = new ExchangeRouter(pinnedBinance);
    for (let i = 0; i < 3; i += 1) {
      const decision = router.routeTicker(ctx());
      expect(decision.ok).toBe(true);
      if (decision.ok) expect(decision.data.exchange).toBe('binance');
    }
  });

  it('errors when the pinned exchange circuit is open (no silent reroute)', () => {
    const router = new ExchangeRouter(pinnedBinance);
    const decision = router.routeTicker(ctx({ binance: { score: 100, circuitOpen: true } }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error).toContain('binance');
  });

  it('errors when all exchanges are circuit-open', () => {
    const router = new ExchangeRouter(pinnedBinance);
    const decision = router.routeOrder(ctx({
      binance: { score: 0, circuitOpen: true },
      bybit: { score: 0, circuitOpen: true },
      okx: { score: 0, circuitOpen: true },
    }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error).toContain('All exchanges circuit-open');
  });
});

describe('ExchangeRouter — round-robin', () => {
  it('cycles through exchanges in config order when all healthy', () => {
    const router = new ExchangeRouter(roundRobin);
    const seen = [0, 1, 2].map(() => {
      const decision = router.routeTicker(ctx());
      expect(decision.ok).toBe(true);
      return decision.ok ? decision.data.exchange : undefined;
    });
    expect(seen).toEqual(['binance', 'bybit', 'okx']);
  });

  it('skips a circuit-open exchange and continues rotation', () => {
    const router = new ExchangeRouter(roundRobin);
    const c = ctx({ bybit: { score: 100, circuitOpen: true } });
    const seen = [0, 1, 2].map(() => {
      const decision = router.routeTicker(c);
      expect(decision.ok).toBe(true);
      return decision.ok ? decision.data.exchange : undefined;
    });
    expect(seen).toEqual(['binance', 'okx', 'okx']);
  });

  it('errors when all exchanges are circuit-open', () => {
    const router = new ExchangeRouter(roundRobin);
    const decision = router.routeTicker(ctx({
      binance: { score: 0, circuitOpen: true },
      bybit: { score: 0, circuitOpen: true },
      okx: { score: 0, circuitOpen: true },
    }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error).toContain('All exchanges circuit-open');
  });
});

describe('ExchangeRouter — best-health', () => {
  it('picks the highest score when all healthy', () => {
    const router = new ExchangeRouter(bestHealth);
    const decision = router.routeTicker(ctx({
      binance: { score: 80, circuitOpen: false },
      bybit: { score: 95, circuitOpen: false },
      okx: { score: 70, circuitOpen: false },
    }));
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.data.exchange).toBe('bybit');
      expect(decision.data.reason).toContain('95');
    }
  });

  it('skips a circuit-open exchange even if it has the best score', () => {
    const router = new ExchangeRouter(bestHealth);
    const decision = router.routeTicker(ctx({
      binance: { score: 100, circuitOpen: true },
      bybit: { score: 60, circuitOpen: false },
      okx: { score: 50, circuitOpen: false },
    }));
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.data.exchange).toBe('bybit');
  });

  it('errors when all exchanges are circuit-open', () => {
    const router = new ExchangeRouter(bestHealth);
    const decision = router.routeOrder(ctx({
      binance: { score: 0, circuitOpen: true },
      bybit: { score: 0, circuitOpen: true },
      okx: { score: 0, circuitOpen: true },
    }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error).toContain('All exchanges circuit-open');
  });

  it('breaks ties deterministically toward earlier config order', () => {
    const router = new ExchangeRouter(bestHealth);
    const decision = router.routeTicker(ctx({
      binance: { score: 90, circuitOpen: false },
      bybit: { score: 90, circuitOpen: false },
      okx: { score: 90, circuitOpen: false },
    }));
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.data.exchange).toBe('binance');
  });
});

describe('ExchangeRouter — decision shape + determinism', () => {
  it('fallbackOrder starts with the chosen exchange then remaining config order', () => {
    const router = new ExchangeRouter(bestHealth);
    const decision = router.routeTicker(ctx({
      binance: { score: 10, circuitOpen: false },
      bybit: { score: 99, circuitOpen: false },
      okx: { score: 50, circuitOpen: false },
    }));
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.data.fallbackOrder).toEqual(['bybit', 'binance', 'okx']);
    }
  });

  it('same input yields same output across fresh router instances', () => {
    const c = ctx({ okx: { score: 40, circuitOpen: true } });
    const first = new ExchangeRouter(roundRobin).routeTicker(c);
    const second = new ExchangeRouter(roundRobin).routeTicker(c);
    expect(first).toEqual(second);
  });

  it('routeOrder uses the same selection logic as routeTicker', () => {
    const router = new ExchangeRouter(bestHealth);
    const ticker = router.routeTicker(ctx({ bybit: { score: 99, circuitOpen: false } }));
    const order = router.routeOrder(ctx({ bybit: { score: 99, circuitOpen: false } }));
    expect(ticker.ok && order.ok).toBe(true);
    if (ticker.ok && order.ok) {
      expect(ticker.data.exchange).toBe(order.data.exchange);
    }
  });

  it('treats missing health entry as circuit-closed with score 0', () => {
    const router = new ExchangeRouter(bestHealth);
    const decision = router.routeTicker({ health: new Map() });
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.data.exchange).toBe('binance');
  });
});
