import type { ExchangeId } from '@/tree/exchange/types';
import { PaperExchangeProvider, PaperProviderAdapter, ProviderChain } from '@/tree/exchange/provider';
import type { DirectTickerProvider } from '@/tree/exchange/direct';
import { createExchangeProvider } from './orchestrator-helpers';

export class ProviderRegistry {
  readonly providers = new Map<string, PaperExchangeProvider>();
  readonly chains = new Map<string, ProviderChain>();

  constructor(
    private readonly directTickerProviders?: Map<string, DirectTickerProvider> | Record<string, DirectTickerProvider>,
  ) {}

  register(exchangeId: string, provider: PaperExchangeProvider): void {
    this.providers.set(exchangeId, provider);
    this.chains.set(exchangeId, new ProviderChain({ primary: new PaperProviderAdapter(provider, exchangeId as ExchangeId) }));
  }

  getOrCreate(exchange: string): PaperExchangeProvider {
    let provider = this.providers.get(exchange);
    if (!provider) {
      provider = createExchangeProvider(exchange, this.directTickerProviders);
      this.providers.set(exchange, provider);
      this.chains.set(exchange, new ProviderChain({ primary: new PaperProviderAdapter(provider, exchange as ExchangeId) }));
    }
    return provider;
  }

  chainFor(exchange: string): ProviderChain {
    const chain = this.chains.get(exchange);
    if (!chain) throw new Error(`No provider chain registered for ${exchange}`);
    return chain;
  }

  clear(): void {
    this.providers.clear();
    this.chains.clear();
  }
}
