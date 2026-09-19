import type { Ticker, OrderBook, OrderRequest, OrderResult, Balance } from '@/tree/exchange/types';
import type { ProviderResult } from '@/tree/exchange/provider';
import type { Killswitch } from '@/tree/bot/killswitch';
import { type Result } from '@/lib/result';
import { RoutedExecution } from './routed-execution';
import { reportError, safeExecute, executeChainTicker, executeChainOrder } from './orchestrator-helpers';
import { ProviderRegistry } from './orchestrator-registry';
import { RoutingDelegate } from './orchestrator-routing';
import type { ExchangeOrchestratorDeps } from './orchestrator-types';

export class ExchangeOrchestrator {
  private lastProvenance = new Map<string, ProviderResult<Ticker | OrderResult>>();
  private killswitch: Killswitch;
  private onError?: (err: Error, ctx: string) => void;
  private registry: ProviderRegistry;
  private routing: RoutingDelegate;

  constructor(deps: ExchangeOrchestratorDeps = {}) {
    this.killswitch = deps.killswitch ?? ({} as Killswitch);
    this.onError = deps.onError;
    this.registry = new ProviderRegistry(deps.directTickerProviders);
    const routed = new RoutedExecution({
      providers: this.registry.providers,
      killswitch: this.killswitch,
      onProvenance: (exchange, result) => this.lastProvenance.set(exchange, result),
      reportError: (err, ctx) => reportError(this.onError, err, ctx),
    });
    this.routing = new RoutingDelegate(routed);
  }

  registerProvider(exchangeId: string, provider: Parameters<ProviderRegistry['register']>[1]): void {
    this.registry.register(exchangeId, provider);
  }

  getProvider(exchangeId: string) { return this.registry.providers.get(exchangeId); }
  getLastProvenance(exchangeId: string): ProviderResult<Ticker | OrderResult> | undefined { return this.lastProvenance.get(exchangeId); }

  async fetchTicker(exchange: string, symbol: string): Promise<Result<Ticker>> {
    this.registry.getOrCreate(exchange);
    const { result, provenance } = await executeChainTicker(this.registry.chainFor(exchange), symbol, this.onError);
    this.lastProvenance.set(exchange, provenance);
    return result;
  }

  async fetchOrderBook(exchange: string, symbol: string, depth = 20): Promise<Result<OrderBook>> {
    const provider = this.registry.getOrCreate(exchange);
    return safeExecute(this.onError, `fetchOrderBook/${symbol}`, () => provider.fetchOrderBook(exchange as Parameters<typeof provider.fetchOrderBook>[0], symbol, depth));
  }

  async placeOrder(exchange: string, request: OrderRequest): Promise<Result<OrderResult>> {
    const provider = this.registry.getOrCreate(exchange);
    const { result, provenance } = await executeChainOrder(
      this.registry.chainFor(exchange), provider, exchange, request, this.killswitch, this.onError,
    );
    if (provenance) this.lastProvenance.set(exchange, provenance);
    return result;
  }

  async cancelOrder(exchange: string, orderId: string, symbol: string): Promise<Result<boolean>> {
    const provider = this.registry.getOrCreate(exchange);
    return safeExecute(this.onError, `cancelOrder/${orderId}`, () => provider.cancelOrder(exchange as Parameters<typeof provider.cancelOrder>[0], orderId, symbol));
  }

  async fetchOrder(exchange: string, orderId: string, symbol: string): Promise<Result<OrderResult>> {
    const provider = this.registry.getOrCreate(exchange);
    return safeExecute(this.onError, `fetchOrder/${orderId}`, () => provider.fetchOrder(exchange as Parameters<typeof provider.fetchOrder>[0], orderId, symbol));
  }

  async fetchBalances(exchange: string): Promise<Result<Balance[]>> {
    const provider = this.registry.getOrCreate(exchange);
    return safeExecute(this.onError, `fetchBalances/${exchange}`, () => provider.fetchBalances(exchange as Parameters<typeof provider.fetchBalances>[0]));
  }

  ping(exchange: string): Promise<boolean> {
    const provider = this.registry.providers.get(exchange);
    return Promise.resolve(!provider || !provider.isCircuitOpen());
  }

  destroy(): void {
    this.registry.clear();
    this.lastProvenance.clear();
  }

  configureRouting(config: unknown): Result<void> { return this.routing.configureRouting(config); }
  routedFetchTicker(symbol: string): Promise<Result<Ticker>> { return this.routing.routedFetchTicker(symbol); }
  routedPlaceOrder(request: OrderRequest): Promise<Result<OrderResult>> { return this.routing.routedPlaceOrder(request); }
  routedCancelOrder(orderId: string, symbol: string): Promise<Result<boolean>> { return this.routing.routedCancelOrder(orderId, symbol); }
  routedFetchOrder(orderId: string, symbol: string): Promise<Result<OrderResult>> { return this.routing.routedFetchOrder(orderId, symbol); }
  getOrderAffinity(orderId: string): string | undefined { return this.routing.getOrderAffinity(orderId); }
}
