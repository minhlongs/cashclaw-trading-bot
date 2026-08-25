// RoutedExecution — cross-exchange routing logic for ExchangeOrchestrator.
// Paper-only: operates on PaperExchangeProvider instances in the orchestrator's
// providers map. Order affinity (orderId -> exchange) pins cancel/fetch to the
// exchange that actually placed the order; orders never failover mid-flight.

import type { ExchangeId, Ticker, OrderRequest, OrderResult } from '@/tree/exchange/types';
import {
  ExchangeRouter,
  RoutingChain,
  PaperExchangeProvider,
  PaperProviderAdapter,
  RoutingConfigSchema,
  type RouteContext,
  type RoutingConfig,
  type RouteDecision,
  type ProviderResult,
} from '@/tree/exchange/provider';
import { ok, err, type Result } from '@/lib/result';

export interface RoutedExecutionDeps {
  providers: Map<string, PaperExchangeProvider>;
  killswitch: { isTradingEnabled(): boolean };
  onProvenance: (exchange: string, result: ProviderResult<Ticker | OrderResult>) => void;
  reportError: (error: Error, ctx: string) => void;
}

export class RoutedExecution {
  private router: ExchangeRouter | null = null;
  private config: RoutingConfig | null = null;
  private readonly orderAffinity = new Map<string, ExchangeId>();
  private readonly deps: RoutedExecutionDeps;

  constructor(deps: RoutedExecutionDeps) {
    this.deps = deps;
  }

  configureRouting(config: unknown): Result<void> {
    const parsed = RoutingConfigSchema.safeParse(config);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return err(`Invalid routing config: ${message}`);
    }
    this.config = parsed.data;
    this.router = new ExchangeRouter(this.config);
    this.orderAffinity.clear();
    return ok(undefined);
  }

  isConfigured(): boolean {
    return this.router !== null && this.config !== null;
  }

  async fetchTicker(symbol: string): Promise<Result<Ticker>> {
    if (!this.router || !this.config) {
      return err('Routing not configured — call configureRouting first');
    }
    const decision = this.router.routeTicker(this.buildRouteContext());
    if (!decision.ok) return err(decision.error);

    this.ensureProviders();
    const chain = this.buildChain(decision.data);
    const result = await chain.execute((provider) => provider.fetchTicker(symbol));
    this.deps.onProvenance(decision.data.exchange, result);
    if (!result.ok || result.data === undefined) {
      const message = result.error ?? 'Empty ticker data';
      this.deps.reportError(new Error(message), `routedFetchTicker/${symbol}`);
      return err(message);
    }
    return ok(result.data);
  }

  async placeOrder(request: OrderRequest): Promise<Result<OrderResult>> {
    if (!this.router || !this.config) {
      return err('Routing not configured — call configureRouting first');
    }
    if (!this.deps.killswitch.isTradingEnabled()) {
      this.deps.reportError(new Error('Trading halted by killswitch'), `routedPlaceOrder/${request.symbol}`);
      return err('Trading halted by killswitch');
    }
    const decision = this.router.routeOrder(this.buildRouteContext());
    if (!decision.ok) return err(decision.error);

    this.ensureProviders();
    const chain = this.buildChain(decision.data);
    const result = await chain.execute((provider) => provider.placeOrder(request));
    this.deps.onProvenance(decision.data.exchange, result);
    if (!result.ok || result.data === undefined) {
      const message = result.error ?? 'Empty order data';
      this.deps.reportError(new Error(message), `routedPlaceOrder/${request.symbol}`);
      return err(message);
    }
    this.orderAffinity.set(result.data.id, decision.data.exchange);
    return ok(result.data);
  }

  async cancelOrder(orderId: string, symbol: string): Promise<Result<boolean>> {
    if (!this.config) return err('Routing not configured — call configureRouting first');
    const exchange = this.orderAffinity.get(orderId);
    if (!exchange) {
      return err(`No affinity for order ${orderId} — cannot route cancel`);
    }
    const provider = this.deps.providers.get(exchange);
    if (!provider) return err(`Provider ${exchange} not registered for order ${orderId}`);
    try {
      return ok(await provider.cancelOrder(exchange, orderId, symbol));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.reportError(error instanceof Error ? error : new Error(message), `routedCancelOrder/${orderId}`);
      return err(message);
    }
  }

  async fetchOrder(orderId: string, symbol: string): Promise<Result<OrderResult>> {
    if (!this.config) return err('Routing not configured — call configureRouting first');
    const exchange = this.orderAffinity.get(orderId);
    if (!exchange) {
      return err(`No affinity for order ${orderId} — cannot route fetch`);
    }
    const provider = this.deps.providers.get(exchange);
    if (!provider) return err(`Provider ${exchange} not registered for order ${orderId}`);
    try {
      return ok(await provider.fetchOrder(exchange, orderId, symbol));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.reportError(error instanceof Error ? error : new Error(message), `routedFetchOrder/${orderId}`);
      return err(message);
    }
  }

  getOrderAffinity(orderId: string): ExchangeId | undefined {
    return this.orderAffinity.get(orderId);
  }

  private buildRouteContext(): RouteContext {
    const health = new Map<ExchangeId, { score: number; circuitOpen: boolean }>();
    for (const [exchangeId, provider] of this.deps.providers) {
      const providerHealth = provider.getHealth();
      health.set(exchangeId as ExchangeId, {
        score: providerHealth.score,
        circuitOpen: provider.isCircuitOpen(),
      });
    }
    return { health };
  }

  private ensureProviders(): void {
    if (!this.config) return;
    for (const exchange of this.config.exchanges) {
      if (!this.deps.providers.has(exchange)) {
        this.deps.providers.set(exchange, new PaperExchangeProvider({
          type: 'paper',
          exchangeId: exchange,
          initialBalances: [{ currency: 'USDT', total: 10000 }],
        }));
      }
    }
  }

  private buildChain(decision: RouteDecision): RoutingChain {
    const adapters = decision.fallbackOrder.map((exchange) => {
      const provider = this.deps.providers.get(exchange);
      if (!provider) throw new Error(`No provider registered for exchange ${exchange}`);
      return new PaperProviderAdapter(provider, exchange);
    });
    return new RoutingChain(adapters);
  }
}
