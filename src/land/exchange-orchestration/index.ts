// Land layer — Exchange Orchestration
// Wraps PaperExchangeProvider (v1) + CCXT providers (v2).
// Uses Killswitch + rate-limit guards + circuit breaker per provider.
// v2 wiring path: BotManager passes orchestrator into BotDependencies;
// BotInstance.placeOrder calls orchestrator.placeOrder() and unwraps Result;
// killswitch + circuit-breaker checks live ONLY here; ExchangeAdapter unchanged.
import type { ExchangeId, Ticker, OrderBook, OrderRequest, OrderResult, Balance } from '@/tree/exchange/types';
import { PaperExchangeProvider, PaperProviderAdapter, ProviderChain, type ProviderResult } from '@/tree/exchange/provider';
import { Killswitch } from '@/tree/bot/killswitch';
import { ok, err, type Result } from '@/lib/result';
import { createLogger } from '@/lib/logger';
import { RoutedExecution } from './routed-execution';

const log = createLogger('exchange-orchestration');

export interface ExchangeOrchestratorDeps {
  killswitch?: Killswitch;
  onError?: (err: Error, ctx: string) => void;
}

export class ExchangeOrchestrator {
  private providers: Map<string, PaperExchangeProvider> = new Map();
  private chains: Map<string, ProviderChain> = new Map();
  private lastProvenance: Map<string, ProviderResult<Ticker | OrderResult>> = new Map();
  private killswitch: Killswitch;
  private onError?: (err: Error, ctx: string) => void;
  private routed: RoutedExecution;

  constructor(deps: ExchangeOrchestratorDeps = {}) {
    this.killswitch = deps.killswitch ?? ({} as Killswitch);
    this.onError = deps.onError;
    this.routed = new RoutedExecution({ providers: this.providers, killswitch: this.killswitch, onProvenance: (exchange, result) => this.lastProvenance.set(exchange, result), reportError: (err, ctx) => this.reportError(err, ctx) });
  }

  private reportError(err: Error, ctx: string): void {
    try {
      if (this.onError) this.onError(err, ctx);
    } catch (error) {
      log.error('Error reporter failed', error instanceof Error ? error : new Error(String(error)), { action: 'reportError' });
    }
  }

  /** Register a provider for an exchange id (e.g. 'binance:mainnet') */
  registerProvider(exchangeId: string, provider: PaperExchangeProvider): void {
    this.providers.set(exchangeId, provider);
    this.chains.set(exchangeId, new ProviderChain({ primary: new PaperProviderAdapter(provider, exchangeId as ExchangeId) }));
  }

  /** Get already-registered provider */
  getProvider(exchangeId: string): PaperExchangeProvider | undefined {
    return this.providers.get(exchangeId);
  }

  /** Get the last ProviderChain provenance for an exchange, if any */
  getLastProvenance(exchangeId: string): ProviderResult<Ticker | OrderResult> | undefined {
    return this.lastProvenance.get(exchangeId);
  }

  private getOrCreateProvider(exchange: string): PaperExchangeProvider {
    let provider = this.providers.get(exchange);
    if (!provider) {
      provider = new PaperExchangeProvider({
        type: 'paper',
        exchangeId: exchange,
        initialBalances: [{ currency: 'USDT', total: 10000 }],
      });
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

  async fetchTicker(
    exchange: string,
    symbol: string,
  ): Promise<Result<Ticker>> {
    this.getOrCreateProvider(exchange);
    const chain = this.chainFor(exchange);
    const chainResult = await chain.execute((p) => p.fetchTicker(symbol));
    this.lastProvenance.set(exchange, chainResult);
    if (!chainResult.ok || chainResult.data === undefined) {
      this.reportError(new Error(chainResult.ok ? 'Empty ticker data' : chainResult.error), `fetchTicker/${symbol}`);
      return err(chainResult.ok ? 'Empty ticker data' : chainResult.error ?? 'Unknown error');
    }
    return ok(chainResult.data);
  }

  async fetchOrderBook(exchange: string, symbol: string, depth = 20): Promise<Result<OrderBook>> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return ok(await provider.fetchOrderBook(exchange as ExchangeId, symbol, depth));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.reportError(error instanceof Error ? error : new Error(msg), `fetchOrderBook/${symbol}`);
      return err(msg);
    }
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
    const chain = this.chainFor(exchange);
    const chainResult = await chain.execute((p) => p.placeOrder(request));
    this.lastProvenance.set(exchange, chainResult);
    if (!chainResult.ok || chainResult.data === undefined) {
      this.reportError(new Error(chainResult.ok ? 'Empty order data' : chainResult.error), `placeOrder/${request.symbol}`);
      return err(chainResult.ok ? 'Empty order data' : chainResult.error ?? 'Unknown error');
    }
    return ok(chainResult.data);
  }

  async cancelOrder(exchange: string, orderId: string, symbol: string): Promise<Result<boolean>> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return ok(await provider.cancelOrder(exchange as ExchangeId, orderId, symbol));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.reportError(error instanceof Error ? error : new Error(msg), `cancelOrder/${orderId}`);
      return err(msg);
    }
  }

  async fetchOrder(exchange: string, orderId: string, symbol: string): Promise<Result<OrderResult>> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return ok(await provider.fetchOrder(exchange as ExchangeId, orderId, symbol));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.reportError(error instanceof Error ? error : new Error(msg), `fetchOrder/${orderId}`);
      return err(msg);
    }
  }

  async fetchBalances(exchange: string): Promise<Result<Balance[]>> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return ok(await provider.fetchBalances(exchange as ExchangeId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.reportError(error instanceof Error ? error : new Error(msg), `fetchBalances/${exchange}`);
      return err(msg);
    }
  }

  ping(exchange: string): Promise<boolean> {
    const provider = this.providers.get(exchange);
    if (!provider) return Promise.resolve(true);
    return Promise.resolve(!provider.isCircuitOpen());
  }

  destroy(): void {
    this.providers.clear();
    this.chains.clear();
    this.lastProvenance.clear();
  }

  /** Configure cross-exchange routing (paper-only, Zod-validated). */
  configureRouting(config: unknown): Result<void> { return this.routed.configureRouting(config); }
  /** Fetch ticker using configured routing strategy. */
  async routedFetchTicker(symbol: string): Promise<Result<Ticker>> { return this.routed.fetchTicker(symbol); }
  /** Place order using configured routing strategy; affinity pins cancel/fetch. */
  async routedPlaceOrder(request: OrderRequest): Promise<Result<OrderResult>> { return this.routed.placeOrder(request); }
  /** Cancel order on the exchange where it was originally placed. */
  async routedCancelOrder(orderId: string, symbol: string): Promise<Result<boolean>> { return this.routed.cancelOrder(orderId, symbol); }
  /** Fetch order on the exchange where it was originally placed. */
  async routedFetchOrder(orderId: string, symbol: string): Promise<Result<OrderResult>> { return this.routed.fetchOrder(orderId, symbol); }
  /** Get the exchange affinity for a routed order (for tests/inspection). */
  getOrderAffinity(orderId: string): string | undefined { return this.routed.getOrderAffinity(orderId); }
}

// Singleton
let orchestrator: ExchangeOrchestrator | null = null;

export function getExchangeOrchestrator(deps?: ExchangeOrchestratorDeps): ExchangeOrchestrator {
  if (!orchestrator) {
    orchestrator = new ExchangeOrchestrator(deps);
  }
  return orchestrator;
}

export function resetExchangeOrchestrator(): void {
  orchestrator?.destroy();
  orchestrator = null;
}
