import type { ExchangeId, Balance, OrderRequest, OrderResult } from '../types';
import type { PaperExchange } from '../paper';
import type { CircuitBreaker } from './circuit-breaker';
import { runRecorded, type HealthRecorder } from './paper-provider-runner';

export async function fetchBalances(adapter: PaperExchange, breaker: CircuitBreaker, exchangeId: ExchangeId, recorder: HealthRecorder): Promise<Balance[]> {
  return runRecorded({ breaker, adapterCall: () => adapter.fetchBalances(exchangeId), recorder });
}

export async function placeOrder(adapter: PaperExchange, breaker: CircuitBreaker, exchangeId: ExchangeId, req: OrderRequest, recorder: HealthRecorder): Promise<OrderResult> {
  return runRecorded({ breaker, adapterCall: () => adapter.placeOrder(exchangeId, req), recorder });
}

export async function cancelOrder(adapter: PaperExchange, breaker: CircuitBreaker, orderId: string, symbol: string, recorder: HealthRecorder): Promise<boolean> {
  return runRecorded({ breaker, adapterCall: () => adapter.cancelOrder(orderId, symbol), recorder });
}

export async function fetchOrder(adapter: PaperExchange, breaker: CircuitBreaker, orderId: string, recorder: HealthRecorder): Promise<OrderResult> {
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
