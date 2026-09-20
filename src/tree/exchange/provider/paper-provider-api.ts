// PaperExchangeProvider API wrappers — the six adapter-calling methods that
// all share the same try/catch + recordSuccess/recordFailure pattern.
// Extracted to keep the facade class under 120 LOC.

import type { ExchangeId, Ticker, OrderBook, Balance, OrderRequest, OrderResult } from '../types';
import type { PaperExchange } from '../paper';
import type { CircuitBreaker } from './circuit-breaker';
import type { ProviderHealth } from './types';
import { applyRecordSuccess } from './paper-provider-health';

/** Apply recordSuccess/recordFailure transitions to a health reference. */
interface HealthRecorder {
  health: ProviderHealth;
  setHealth: (next: ProviderHealth) => void;
  recordFailure: () => void;
}

/** Run an adapter call inside the circuit breaker and record the outcome. */
async function runRecorded<T>(params: {
  breaker: CircuitBreaker;
  adapterCall: () => Promise<T>;
  recorder: HealthRecorder;
  now?: number;
}): Promise<T> {
  const start = params.now ?? Date.now();
  try {
    const result = await params.breaker.execute(params.adapterCall);
    params.recorder.setHealth(applyRecordSuccess(params.recorder.health, Date.now() - start));
    return result;
  } catch (err) {
    params.recorder.recordFailure();
    throw err;
  }
}

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

export async function fetchBalances(
  adapter: PaperExchange,
  breaker: CircuitBreaker,
  exchangeId: ExchangeId,
  recorder: HealthRecorder,
): Promise<Balance[]> {
  return runRecorded({
    breaker,
    adapterCall: () => adapter.fetchBalances(exchangeId),
    recorder,
  });
}

export async function placeOrder(
  adapter: PaperExchange,
  breaker: CircuitBreaker,
  exchangeId: ExchangeId,
  req: OrderRequest,
  recorder: HealthRecorder,
): Promise<OrderResult> {
  return runRecorded({
    breaker,
    adapterCall: () => adapter.placeOrder(exchangeId, req),
    recorder,
  });
}

export async function cancelOrder(
  adapter: PaperExchange,
  breaker: CircuitBreaker,
  orderId: string,
  symbol: string,
  recorder: HealthRecorder,
): Promise<boolean> {
  return runRecorded({
    breaker,
    adapterCall: () => adapter.cancelOrder(orderId, symbol),
    recorder,
  });
}

export async function fetchOrder(
  adapter: PaperExchange,
  breaker: CircuitBreaker,
  orderId: string,
  recorder: HealthRecorder,
): Promise<OrderResult> {
  return runRecorded({
    breaker,
    adapterCall: async () => {
      const trade = adapter.getOrder(orderId);
      if (!trade) throw new Error(`Order not found: ${orderId}`);
      return adapter.toOrderResultPublic(trade);
    },
    recorder,
  });
}
