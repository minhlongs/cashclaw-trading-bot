// RoutedExecution helpers — context & chain factories extracted from RoutedExecution.
// Paper-only: operates on PaperExchangeProvider instances in the orchestrator's
// providers map. Order affinity (orderId -> exchange) pins cancel/fetch to the
// exchange that actually placed the order; orders never failover mid-flight.

import type { ExchangeId } from '@/tree/exchange/types';
import {
  PaperExchangeProvider,
  PaperProviderAdapter,
  RoutingChain,
  type RouteContext,
  type RouteDecision,
} from '@/tree/exchange/provider';

/**
 * Build a RouteContext from the current provider health snapshot.
 * Pure function — no side effects.
 */
export function buildRouteContext(
  providers: Map<string, PaperExchangeProvider>,
): RouteContext {
  const health = new Map<ExchangeId, { score: number; circuitOpen: boolean }>();
  for (const [exchangeId, provider] of providers) {
    const providerHealth = provider.getHealth();
    health.set(exchangeId as ExchangeId, {
      score: providerHealth.score,
      circuitOpen: provider.isCircuitOpen(),
    });
  }
  return { health };
}

/**
 * Ensure all exchanges in the routing config have a registered provider.
 * Creates PaperExchangeProvider instances for any missing exchanges.
 */
export function ensureProviders(
  config: { exchanges: string[] },
  providers: Map<string, PaperExchangeProvider>,
): void {
  for (const exchange of config.exchanges) {
    if (!providers.has(exchange)) {
      providers.set(exchange, new PaperExchangeProvider({
        type: 'paper',
        exchangeId: exchange,
        initialBalances: [{ currency: 'USDT', total: 10000 }],
      }));
    }
  }
}

/**
 * Build a RoutingChain from a route decision's fallback order.
 * Throws if any exchange in the fallback order lacks a registered provider.
 */
export function buildChain(
  decision: RouteDecision,
  providers: Map<string, PaperExchangeProvider>,
) {
  const adapters = decision.fallbackOrder.map((exchange) => {
    const provider = providers.get(exchange);
    if (!provider) throw new Error(`No provider registered for exchange ${exchange}`);
    return new PaperProviderAdapter(provider, exchange);
  });
  return new RoutingChain(adapters);
}
