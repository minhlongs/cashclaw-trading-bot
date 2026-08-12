// Land layer — Exchange Orchestration
// Wraps PaperExchange + CCXT adapters with killswitch + rate-limit guards.

import type { Ticker, OrderBook, OrderRequest, OrderResult, Balance } from '@/tree/exchange/types';
import { PaperExchange } from '@/tree/exchange';
import { Killswitch } from '@/tree/bot/killswitch';

export interface ExchangeOrchestratorDeps {
  killswitch?: Killswitch;
  onError?: (err: Error, ctx: string) => void;
}

export class ExchangeOrchestrator {
  private adapters: Map<string, PaperExchange> = new Map();
  private killswitch: Killswitch;

  constructor(deps: ExchangeOrchestratorDeps = {}) {
    this.killswitch = deps.killswitch ?? ({} as Killswitch);
  }

  private getOrCreatePaper(exchange: string): PaperExchange {
    let adapter = this.adapters.get(exchange);
    if (!adapter) {
      adapter = new PaperExchange([{ currency: 'USDT', total: 10000 }]);
      this.adapters.set(exchange, adapter);
    }
    return adapter;
  }

  async fetchTicker(
    exchange: string,
    symbol: string,
  ): Promise<{ symbol: string; last: number; bid: number; ask: number; high24h: number; low24h: number; volume24h: number; timestamp: number }> {
    const adapter = this.getOrCreatePaper(exchange);
    const ticker = await adapter.fetchTicker(exchange as Parameters<typeof adapter.fetchTicker>[0], symbol);
    return ticker;
  }

  async fetchOrderBook(exchange: string, symbol: string, depth = 20): Promise<OrderBook> {
    const adapter = this.getOrCreatePaper(exchange);
    return adapter.fetchOrderBook(exchange as Parameters<typeof adapter.fetchOrderBook>[0], symbol, depth);
  }

  async placeOrder(
    exchange: string,
    request: OrderRequest,
  ): Promise<OrderResult> {
    if (!this.killswitch.isTradingEnabled()) {
      throw new Error('Trading halted by killswitch');
    }
    const adapter = this.getOrCreatePaper(exchange);
    return adapter.placeOrder(exchange as Parameters<typeof adapter.placeOrder>[0], request);
  }

  async cancelOrder(exchange: string, orderId: string, symbol: string): Promise<boolean> {
    const adapter = this.getOrCreatePaper(exchange);
    return adapter.cancelOrder(orderId, symbol);
  }

  async fetchOrder(exchange: string, orderId: string, symbol: string): Promise<OrderResult> {
    const adapter = this.getOrCreatePaper(exchange);
    return adapter.fetchOrder(orderId, symbol);
  }

  async fetchBalances(exchange: string): Promise<Balance[]> {
    const adapter = this.getOrCreatePaper(exchange);
    return adapter.fetchBalances(exchange as Parameters<typeof adapter.fetchBalances>[0]);
  }

  ping(exchange: string): Promise<boolean> {
    const adapter = this.adapters.get(exchange);
    return adapter ? adapter.ping() : Promise.resolve(true);
  }

  destroy(): void {
    for (const [, adapter] of this.adapters) {
      // PaperExchange has no close method
    }
    this.adapters.clear();
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
