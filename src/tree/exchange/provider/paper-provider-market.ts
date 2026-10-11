import type { ExchangeId, Ticker, OrderBook } from '../types';
import type { PaperExchange } from '../paper';
import type { CircuitBreaker } from './circuit-breaker';
import { runRecorded, type HealthRecorder } from './paper-provider-runner';

export async function fetchTicker(
  adapter: PaperExchange,
  breaker: CircuitBreaker,
  exchangeId: ExchangeId,
  symbol: string,
  recorder: HealthRecorder,
): Promise<Ticker> {
  return runRecorded({
    breaker,
    adapterCall: () => adapter.fetchTicker(exchangeId, symbol),
    recorder,
  });
}

export async function fetchOrderBook(
  adapter: PaperExchange,
  breaker: CircuitBreaker,
  exchangeId: ExchangeId,
  symbol: string,
  depth: number,
  recorder: HealthRecorder,
): Promise<OrderBook> {
  return runRecorded({
    breaker,
    adapterCall: () => adapter.fetchOrderBook(exchangeId, symbol, depth),
    recorder,
  });
}
