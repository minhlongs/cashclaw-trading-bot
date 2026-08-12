// Land layer — Exchange Orchestration
// Wraps PaperExchangeProvider (v1) + CCXT providers (v2).
// Uses Killswitch + rate-limit guards + circuit breaker per provider.
import type { ExchangeId, Ticker, OrderBook, OrderRequest, OrderResult, Balance } from '@/tree/exchange/types';
import { PaperExchangeProvider } from '@/tree/exchange/provider';
import { Killswitch } from '@/tree/bot/killswitch';

export interface ExchangeOrchestratorDeps {
  killswitch?: Killswitch;
  onError?: (err: Error, ctx: string) => void;
}

export class ExchangeOrchestrator {
  private providers: Map<string, PaperExchangeProvider> = new Map();
  private killswitch: Killswitch;
  private onError?: (err: Error, ctx: string) => void;

  constructor(deps: ExchangeOrchestratorDeps = {}) {
    this.killswitch = deps.killswitch ?? ({} as Killswitch);
    this.onError = deps.onError;
  }

  private reportError(err: Error, ctx: string): void {
    try {
      if (this.onError) this.onError(err, ctx);
    } catch {
      // never throw from error reporter
    }
  }

  /** Register a provider for an exchange id (e.g. 'binance:mainnet') */
  registerProvider(exchangeId: string, provider: PaperExchangeProvider): void {
    this.providers.set(exchangeId, provider);
  }

  /** Get already-registered provider */
  getProvider(exchangeId: string): PaperExchangeProvider | undefined {
    return this.providers.get(exchangeId);
  }

  /** Pick the healthiest provider for the exchange (null-op for v1 single-provider) */
  selectHealthyProvider(exchangeId: string): PaperExchangeProvider | undefined {
    const p = this.providers.get(exchangeId);
    if (p && !p.isUnhealthy()) return p;
    return undefined;
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
    }
    return provider;
  }

  async fetchTicker(
    exchange: string,
    symbol: string,
  ): Promise<Ticker> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return await provider.fetchTicker(exchange as ExchangeId, symbol);
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error(String(err)), `fetchTicker/${symbol}`);
      throw err;
    }
  }

  async fetchOrderBook(exchange: string, symbol: string, depth = 20): Promise<OrderBook> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return await provider.fetchOrderBook(exchange as ExchangeId, symbol, depth);
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error(String(err)), `fetchOrderBook/${symbol}`);
      throw err;
    }
  }

  async placeOrder(exchange: string, request: OrderRequest): Promise<OrderResult> {
    if (!this.killswitch.isTradingEnabled()) {
      throw new Error('Trading halted by killswitch');
    }
    const provider = this.getOrCreateProvider(exchange);
    if (provider.isCircuitOpen()) {
      const health = provider.getHealth();
      throw new Error(`Trading paused for ${exchange} — provider score ${health.score}, failures ${health.failureCount}`);
    }
    try {
      return await provider.placeOrder(exchange as ExchangeId, request);
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error(String(err)), `placeOrder/${request.symbol}`);
      throw err;
    }
  }

  async cancelOrder(exchange: string, orderId: string, symbol: string): Promise<boolean> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return await provider.cancelOrder(exchange as ExchangeId, orderId, symbol);
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error(String(err)), `cancelOrder/${orderId}`);
      throw err;
    }
  }

  async fetchOrder(exchange: string, orderId: string, symbol: string): Promise<OrderResult> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return await provider.fetchOrder(exchange as ExchangeId, orderId, symbol);
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error(String(err)), `fetchOrder/${orderId}`);
      throw err;
    }
  }

  async fetchBalances(exchange: string): Promise<Balance[]> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return await provider.fetchBalances(exchange as ExchangeId);
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error(String(err)), `fetchBalances/${exchange}`);
      throw err;
    }
  }

  ping(exchange: string): Promise<boolean> {
    const provider = this.providers.get(exchange);
    if (!provider) return Promise.resolve(true);
    return Promise.resolve(!provider.isCircuitOpen());
  }

  destroy(): void {
    this.providers.clear();
  }
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
