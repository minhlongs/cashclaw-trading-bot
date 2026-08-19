// PaperProviderAdapter — bridges PaperExchangeProvider to TickerProvider & OrderProvider.
// ProviderChain.execute wraps return values in ProviderResult, so this adapter returns
// raw Ticker/OrderResult and throws on error (does not wrap itself).

import type { ExchangeId, Ticker, OrderRequest, OrderResult } from '../types';
import { PaperExchangeProvider } from './paper-provider';
import type { CircuitBreaker } from './circuit-breaker';
import type { TickerProvider, OrderProvider } from './provider';

type AdapterProvider = TickerProvider & OrderProvider;

export class PaperProviderAdapter implements AdapterProvider {
  readonly name: string;
  readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly provider: PaperExchangeProvider,
    private readonly exchangeId: ExchangeId,
  ) {
    this.name = exchangeId;
    this.circuitBreaker = provider.getCircuitBreaker();
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(!this.provider.isUnhealthy());
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    return this.provider.fetchTicker(this.exchangeId, symbol);
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    return this.provider.placeOrder(this.exchangeId, req);
  }
}