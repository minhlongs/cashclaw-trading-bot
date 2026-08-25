// Paper-only invariant guards for the cross-exchange routing layer.
//
// Routing must NEVER operate on live providers. This file enforces that with
// three independent tripwires:
//   1. Compile-time — `@ts-expect-error` directives prove LiveExchange cannot
//      enter any paper-only slot. If a future change loosens the types, the
//      directives become unused and `npm run type-check` FAILS.
//   2. Runtime — a live-style ExchangeAdapter object is rejected because it
//      lacks the Provider contract (name/circuitBreaker/healthCheck).
//   3. Source-level — no routing source file imports live/ or ccxt/ modules.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExchangeId, ExchangeAdapter } from '../types';
import { PaperExchangeProvider } from './paper-provider';
import { PaperProviderAdapter } from './paper-provider-adapter';
import { RoutingChain } from './routing-chain';
import { ExchangeRouter } from './exchange-router';
import { RoutingConfigSchema } from './routing-types';

// Type-only import: erased at runtime, so no live/ccxt code is ever loaded.
// Referenced ONLY by the compile-time guards below (which are never executed).
import type { LiveExchange } from '../live';

// Ambient declaration: typed reference without constructing (the real
// constructor requires API credentials). Never initialized, never executed.
declare const liveInstance: LiveExchange;

/**
 * Compile-time tripwire. Type-checked by `tsc --noEmit` but NEVER called.
 * Each `@ts-expect-error` documents a rejection that must hold forever;
 * if one stops erroring, type-check fails and the gate goes red.
 */
export function paperOnlyCompileTimeGuards(): void {
  // Slot 1: the routing adapter accepts PaperExchangeProvider only.
  // @ts-expect-error LiveExchange is not assignable to PaperExchangeProvider
  const asPaper: PaperExchangeProvider = liveInstance;
  // Slot 2: the adapter constructor rejects live instances.
  // @ts-expect-error adapter parameter is PaperExchangeProvider, not ExchangeAdapter
  const adapted: PaperProviderAdapter = new PaperProviderAdapter(liveInstance, 'binance');
  // Slot 3: the routing chain providers satisfy TickerProvider & OrderProvider;
  // LiveExchange lacks name/circuitBreaker/healthCheck and must stay rejected.
  // @ts-expect-error LiveExchange lacks the Provider contract (name/circuitBreaker)
  const chained: RoutingChain = new RoutingChain([liveInstance]);
  void asPaper;
  void adapted;
  void chained;
}

describe('routing paper-only invariant', () => {
  /** Live-style object: full ExchangeAdapter surface, zero Provider members. */
  function makeLiveStyleAdapter(): ExchangeAdapter {
    return {
      id: 'binance',
      name: 'binance-live',
      fetchTicker: () => Promise.reject(new Error('live adapter must never serve routed traffic')),
      fetchOrderBook: () => Promise.reject(new Error('forbidden')),
      fetchBalances: () => Promise.reject(new Error('forbidden')),
      placeOrder: () => Promise.reject(new Error('forbidden')),
      cancelOrder: () => Promise.reject(new Error('forbidden')),
      fetchOrder: () => Promise.reject(new Error('forbidden')),
      fetchOpenOrders: () => Promise.reject(new Error('forbidden')),
      ping: () => Promise.reject(new Error('forbidden')),
      getServerTime: () => Promise.reject(new Error('forbidden')),
    };
  }

  it('compile-time guards exist and are never executed', () => {
    expect(typeof paperOnlyCompileTimeGuards).toBe('function');
  });

  it('runtime: live-style adapter is rejected by PaperProviderAdapter (no circuitBreaker)', () => {
    const liveStyle = makeLiveStyleAdapter();
    // The adapter contract requires getCircuitBreaker(); live adapters have none,
    // so construction fails loud instead of silently serving routed traffic.
    const attempt = (): PaperProviderAdapter =>
      new PaperProviderAdapter(liveStyle as unknown as PaperExchangeProvider, 'binance');
    expect(attempt).toThrow(Error);
  });

  it('runtime: RoutingChain serves registered paper providers only', async () => {
    const paper = new PaperExchangeProvider({
      type: 'paper',
      exchangeId: 'binance',
      initialBalances: [{ currency: 'USDT', total: 10000 }],
    });
    const chain = new RoutingChain([new PaperProviderAdapter(paper, 'binance')]);

    const result = await chain.execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('binance');
    expect(result.provenance.circuitState).toBe(paper.getCircuitBreaker().getState());
  });

  it('runtime: ExchangeRouter holds no provider references — pure config + health', () => {
    const router = new ExchangeRouter({ strategy: 'round-robin', exchanges: ['binance', 'bybit'] });
    const ctx = {
      health: new Map<ExchangeId, { score: number; circuitOpen: boolean }>([
        ['binance', { score: 100, circuitOpen: false }],
        ['bybit', { score: 90, circuitOpen: false }],
      ]),
    };

    const decision = router.routeTicker(ctx);

    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(['binance', 'bybit']).toContain(decision.data.exchange);
      expect(decision.data.fallbackOrder).toEqual(expect.arrayContaining(['binance', 'bybit']));
    }
  });

  it('runtime: RoutingConfigSchema rejects exchanges outside the paper trio', () => {
    const result = RoutingConfigSchema.safeParse({
      strategy: 'round-robin',
      exchanges: ['binance', 'coinbase'],
    });
    expect(result.success).toBe(false);
  });

  it('source: routing files never import live/ or ccxt/ modules', () => {
    const routingSources = [
      'src/tree/exchange/provider/routing-types.ts',
      'src/tree/exchange/provider/exchange-router.ts',
      'src/tree/exchange/provider/routing-chain.ts',
      'src/land/exchange-orchestration/routed-execution.ts',
    ];
    const importSpecifier = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

    for (const relPath of routingSources) {
      const content = readFileSync(join(process.cwd(), relPath), 'utf8');
      const specifiers = [...content.matchAll(importSpecifier)].map((m) => m[1]);
      const forbidden = specifiers.filter(
        (spec) => spec.includes('ccxt') || spec.includes('exchange/live') || spec.endsWith('/live'),
      );
      expect(forbidden, `${relPath} imported forbidden modules: ${forbidden.join(', ')}`).toEqual([]);
    }
  });
});