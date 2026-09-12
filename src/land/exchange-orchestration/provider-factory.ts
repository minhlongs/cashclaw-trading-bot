// Land layer — Exchange Provider Factory
// Instantiates PaperExchangeProvider wired to DirectTickerProvider for supported exchanges.

import type { ExchangeId } from '@/tree/exchange/types';
import { PaperExchangeProvider } from '@/tree/exchange/provider';
import { DirectTickerProvider } from '@/tree/exchange/direct';

export type SupportedDirectExchange = 'binance' | 'okx' | 'bybit';

export function isSupportedDirectExchange(exchange: string): exchange is SupportedDirectExchange {
  return exchange === 'binance' || exchange === 'okx' || exchange === 'bybit';
}

export interface DefaultPaperExchangeProviderOptions {
  directTickerProvider?: DirectTickerProvider;
  initialBalances?: { currency: string; total: number }[];
}

export function createDefaultPaperExchangeProvider(
  exchange: string,
  options?: DefaultPaperExchangeProviderOptions,
): PaperExchangeProvider {
  let directTickerProvider = options?.directTickerProvider;

  if (!directTickerProvider && isSupportedDirectExchange(exchange)) {
    try {
      directTickerProvider = new DirectTickerProvider({ exchangeId: exchange as ExchangeId });
    } catch {
      // Graceful fallback to simulated pricing on instantiation error
    }
  }

  return new PaperExchangeProvider({
    type: 'paper',
    exchangeId: exchange,
    initialBalances: options?.initialBalances ?? [{ currency: 'USDT', total: 10000 }],
    directTickerProvider,
  });
}
