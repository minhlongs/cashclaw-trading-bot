import type { Ticker, OrderRequest, OrderResult } from '@/tree/exchange/types';
import type { Result } from '@/lib/result';
import type { RoutedExecution } from './routed-execution';

export class RoutingDelegate {
  constructor(private readonly routed: RoutedExecution) {}

  configureRouting(config: unknown): Result<void> { return this.routed.configureRouting(config); }
  routedFetchTicker(symbol: string): Promise<Result<Ticker>> { return this.routed.fetchTicker(symbol); }
  routedPlaceOrder(request: OrderRequest): Promise<Result<OrderResult>> { return this.routed.placeOrder(request); }
  routedCancelOrder(orderId: string, symbol: string): Promise<Result<boolean>> { return this.routed.cancelOrder(orderId, symbol); }
  routedFetchOrder(orderId: string, symbol: string): Promise<Result<OrderResult>> { return this.routed.fetchOrder(orderId, symbol); }
  getOrderAffinity(orderId: string): string | undefined { return this.routed.getOrderAffinity(orderId); }
}
