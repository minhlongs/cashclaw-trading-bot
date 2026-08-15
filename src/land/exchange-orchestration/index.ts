// Land layer — Exchange Orchestration
// Wraps PaperExchangeProvider (v1) + CCXT providers (v2).
// Uses Killswitch + rate-limit guards + circuit breaker per provider.
//
// v2 wiring path (single point of exchange interaction):
// - BotManager will pass orchestrator (not raw adapter) into BotDependencies
// - BotInstance.placeOrder will call orchestrator.placeOrder() and unwrap Result
// - Killswitch and circuit-breaker checks live ONLY in orchestrator (remove duplicates later)
// - ExchangeAdapter interface stays unchanged
import type { ExchangeId, Ticker, OrderBook, OrderRequest, OrderResult, Balance } from '@/tree/exchange/types';
import { PaperExchangeProvider } from '@/tree/exchange/provider';
import { Killswitch } from '@/tree/bot/killswitch';
import { ok, err, type Result } from '@/lib/result';
import { createLogger } from '@/lib/logger';

const log = createLogger('exchange-orchestration');

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
    } catch (error) {
      log.error('Error reporter failed', error instanceof Error ? error : new Error(String(error)), { action: 'reportError' });
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
  ): Promise<Result<Ticker>> {
    const provider = this.getOrCreateProvider(exchange);
    try {
      return ok(await provider.fetchTicker(exchange as ExchangeId, symbol));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.reportError(error instanceof Error ? error : new Error(msg), `fetchTicker/${symbol}`);
      return err(msg);
    }
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
    try {
      return ok(await provider.placeOrder(exchange as ExchangeId, request));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.reportError(error instanceof Error ? error : new Error(msg), `placeOrder/${request.symbol}`);
      return err(msg);
    }
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
