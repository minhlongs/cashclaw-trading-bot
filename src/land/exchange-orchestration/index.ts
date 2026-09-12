// Land layer — Exchange Orchestration
// Wraps PaperExchangeProvider (v1) + CCXT providers (v2) with Killswitch + circuit breakers.
import type { ExchangeId, Ticker, OrderBook, OrderRequest, OrderResult, Balance } from '@/tree/exchange/types';
import { PaperExchangeProvider, PaperProviderAdapter, ProviderChain, type ProviderResult } from '@/tree/exchange/provider';
import type { DirectTickerProvider } from '@/tree/exchange/direct';
import { Killswitch } from '@/tree/bot/killswitch';
import { ok, err, type Result } from '@/lib/result';
import { createLogger } from '@/lib/logger';
import { createDefaultPaperExchangeProvider } from './provider-factory';
import { RoutedExecution } from './routed-execution';

const log = createLogger('exchange-orchestration');

export interface ExchangeOrchestratorDeps {
  killswitch?: Killswitch;
  onError?: (err: Error, ctx: string) => void;
  directTickerProviders?: Map<string, DirectTickerProvider> | Record<string, DirectTickerProvider>;
}

export class ExchangeOrchestrator {
  private providers: Map<string, PaperExchangeProvider> = new Map();
  private chains: Map<string, ProviderChain> = new Map();
  private lastProvenance: Map<string, ProviderResult<Ticker | OrderResult>> = new Map();
  private killswitch: Killswitch;
  private onError?: (err: Error, ctx: string) => void;
  private directTickerProviders?: Map<string, DirectTickerProvider> | Record<string, DirectTickerProvider>;
  private routed: RoutedExecution;

  constructor(deps: ExchangeOrchestratorDeps = {}) {
    this.killswitch = deps.killswitch ?? ({} as Killswitch);
    this.onError = deps.onError;
    this.directTickerProviders = deps.directTickerProviders;
    this.routed = new RoutedExecution({
      providers: this.providers,
      killswitch: this.killswitch,
      onProvenance: (exchange, result) => this.lastProvenance.set(exchange, result),
      reportError: (err, ctx) => this.reportError(err, ctx),
    });
  }

  private reportError(err: Error, ctx: string): void {
    try {
      if (this.onError) this.onError(err, ctx);
    } catch (error) {
      log.error('Error reporter failed', error instanceof Error ? error : new Error(String(error)), { action: 'reportError' });
    }
  }

  private async safeExecute<T>(ctx: string, fn: () => Promise<T>): Promise<Result<T>> {
    try {
      return ok(await fn());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.reportError(error instanceof Error ? error : new Error(msg), ctx);
      return err(msg);
    }
  }

  /** Register a provider for an exchange id (e.g. 'binance:mainnet') */
  registerProvider(exchangeId: string, provider: PaperExchangeProvider): void {
    this.providers.set(exchangeId, provider);
    this.chains.set(exchangeId, new ProviderChain({ primary: new PaperProviderAdapter(provider, exchangeId as ExchangeId) }));
  }

  getProvider(exchangeId: string): PaperExchangeProvider | undefined { return this.providers.get(exchangeId); }
  getLastProvenance(exchangeId: string): ProviderResult<Ticker | OrderResult> | undefined { return this.lastProvenance.get(exchangeId); }

  private getOrCreateProvider(exchange: string): PaperExchangeProvider {
    let provider = this.providers.get(exchange);
    if (!provider) {
      const dtp = this.directTickerProviders instanceof Map
        ? this.directTickerProviders.get(exchange)
        : this.directTickerProviders?.[exchange];
      provider = createDefaultPaperExchangeProvider(exchange, { directTickerProvider: dtp });
      this.providers.set(exchange, provider);
      this.chains.set(exchange, new ProviderChain({ primary: new PaperProviderAdapter(provider, exchange as ExchangeId) }));
    }
    return provider;
  }

  private chainFor(exchange: string): ProviderChain {
    const chain = this.chains.get(exchange);
    if (!chain) throw new Error(`No provider chain registered for ${exchange}`);
    return chain;
  }

  async fetchTicker(exchange: string, symbol: string): Promise<Result<Ticker>> {
    this.getOrCreateProvider(exchange);
    const chainResult = await this.chainFor(exchange).execute((p) => p.fetchTicker(symbol));
    this.lastProvenance.set(exchange, chainResult);
    if (!chainResult.ok || chainResult.data === undefined) {
      const msg = chainResult.ok ? 'Empty ticker data' : chainResult.error ?? 'Unknown error';
      this.reportError(new Error(msg), `fetchTicker/${symbol}`);
      return err(msg);
    }
    return ok(chainResult.data);
  }

  async fetchOrderBook(exchange: string, symbol: string, depth = 20): Promise<Result<OrderBook>> {
    const provider = this.getOrCreateProvider(exchange);
    return this.safeExecute(`fetchOrderBook/${symbol}`, () => provider.fetchOrderBook(exchange as ExchangeId, symbol, depth));
  }

  async placeOrder(exchange: string, request: OrderRequest): Promise<Result<OrderResult>> {
    if (!this.killswitch.isTradingEnabled()) {
      this.reportError(new Error('Trading halted by killswitch'), `placeOrder/${request.symbol}`);
      return err('Trading halted by killswitch');
    }
    const provider = this.getOrCreateProvider(exchange);
    if (provider.isCircuitOpen()) {
      const health = provider.getHealth();
      const msg = `Trading paused for ${exchange} — provider score ${health.score}, failures ${health.failureCount}`;
      this.reportError(new Error(msg), `placeOrder/${request.symbol}`);
      return err(msg);
    }
    const chainResult = await this.chainFor(exchange).execute((p) => p.placeOrder(request));
    this.lastProvenance.set(exchange, chainResult);
    if (!chainResult.ok || chainResult.data === undefined) {
      const msg = chainResult.ok ? 'Empty order data' : chainResult.error ?? 'Unknown error';
      this.reportError(new Error(msg), `placeOrder/${request.symbol}`);
      return err(msg);
    }
    return ok(chainResult.data);
  }

  async cancelOrder(exchange: string, orderId: string, symbol: string): Promise<Result<boolean>> {
    const provider = this.getOrCreateProvider(exchange);
    return this.safeExecute(`cancelOrder/${orderId}`, () => provider.cancelOrder(exchange as ExchangeId, orderId, symbol));
  }

  async fetchOrder(exchange: string, orderId: string, symbol: string): Promise<Result<OrderResult>> {
    const provider = this.getOrCreateProvider(exchange);
    return this.safeExecute(`fetchOrder/${orderId}`, () => provider.fetchOrder(exchange as ExchangeId, orderId, symbol));
  }

  async fetchBalances(exchange: string): Promise<Result<Balance[]>> {
    const provider = this.getOrCreateProvider(exchange);
    return this.safeExecute(`fetchBalances/${exchange}`, () => provider.fetchBalances(exchange as ExchangeId));
  }

  ping(exchange: string): Promise<boolean> {
    const provider = this.providers.get(exchange);
    return Promise.resolve(!provider || !provider.isCircuitOpen());
  }

  destroy(): void {
    this.providers.clear();
    this.chains.clear();
    this.lastProvenance.clear();
  }

  /** Configure cross-exchange routing (paper-only, Zod-validated). */
  configureRouting(config: unknown): Result<void> { return this.routed.configureRouting(config); }
  async routedFetchTicker(symbol: string): Promise<Result<Ticker>> { return this.routed.fetchTicker(symbol); }
  async routedPlaceOrder(request: OrderRequest): Promise<Result<OrderResult>> { return this.routed.placeOrder(request); }
  async routedCancelOrder(orderId: string, symbol: string): Promise<Result<boolean>> { return this.routed.cancelOrder(orderId, symbol); }
  async routedFetchOrder(orderId: string, symbol: string): Promise<Result<OrderResult>> { return this.routed.fetchOrder(orderId, symbol); }
  getOrderAffinity(orderId: string): string | undefined { return this.routed.getOrderAffinity(orderId); }
}

let orchestrator: ExchangeOrchestrator | null = null;

export function getExchangeOrchestrator(deps?: ExchangeOrchestratorDeps): ExchangeOrchestrator {
  if (!orchestrator) orchestrator = new ExchangeOrchestrator(deps);
  return orchestrator;
}

export function resetExchangeOrchestrator(): void {
  orchestrator?.destroy();
  orchestrator = null;
}
