// RoutingChain — ordered multi-provider fallback execution.
// Tries providers in the given order (RouteDecision.fallbackOrder), stops at
// first success. Keeps the ProviderResult shape so provenance flows unchanged.
// Circuit breaker state is per-provider and read-only here — never reset.

import type { ProviderResult, TickerProvider, OrderProvider } from './provider';

type ChainProvider = TickerProvider & OrderProvider;

export class RoutingChain {
  private readonly providers: ChainProvider[];

  constructor(providers: ChainProvider[]) {
    if (providers.length === 0) {
      throw new Error('RoutingChain requires at least one provider');
    }
    this.providers = providers;
  }

  async execute<T>(fn: (provider: ChainProvider) => Promise<T>): Promise<ProviderResult<T>> {
    const start = performance.now();
    const failures: string[] = [];

    for (const provider of this.providers) {
      const attemptStart = performance.now();
      try {
        const result = await fn(provider);
        return {
          ok: true,
          data: result,
          provenance: {
            provider: provider.name,
            latencyMs: Math.round(performance.now() - attemptStart),
            circuitState: provider.circuitBreaker.getState(),
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${provider.name}: ${message}`);
      }
    }

    const last = this.providers[this.providers.length - 1];
    return {
      ok: false,
      error: `All providers failed (${failures.join('; ')})`,
      provenance: {
        provider: last.name,
        latencyMs: Math.round(performance.now() - start),
        circuitState: last.circuitBreaker.getState(),
      },
    };
  }
}
