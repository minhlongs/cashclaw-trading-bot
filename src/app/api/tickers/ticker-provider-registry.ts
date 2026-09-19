import { z } from 'zod';
import { DirectTickerProvider } from '@/tree/exchange/direct';

export type SupportedExchange = 'binance' | 'okx' | 'bybit';

export const TickerQuerySchema = z.object({
  exchange: z.enum(['binance', 'okx', 'bybit']).default('binance'),
  symbol: z.string().min(3).max(20).default('BTC/USDT'),
});

const providerMap = new Map<SupportedExchange, DirectTickerProvider>();

export function setDirectTickerProviderForTest(
  exchange: SupportedExchange,
  provider: DirectTickerProvider | null,
): void {
  if (provider === null) {
    providerMap.delete(exchange);
  } else {
    providerMap.set(exchange, provider);
  }
}

export function resetProvidersForTest(): void {
  providerMap.clear();
}

export function getProvider(exchange: SupportedExchange): DirectTickerProvider {
  let provider = providerMap.get(exchange);
  if (!provider) {
    provider = new DirectTickerProvider({ exchangeId: exchange });
    providerMap.set(exchange, provider);
  }
  return provider;
}
