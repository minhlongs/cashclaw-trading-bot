import type { ExchangeId, Ticker, OrderRequest, OrderResult } from '@/tree/exchange/types';
import type { ExchangeRouter, RoutingConfig } from '@/tree/exchange/provider';
import { err, ok, type Result } from '@/lib/result';
import type { RoutedExecutionDeps } from './routed-execution.types';
import { executeRoutedOrder } from './routed-order-handler';
import { executeRoutedTicker } from './routed-ticker-handler';
import { executeRoutedCancel, executeRoutedFetchOrder } from './routed-order-lookup';
import { setupRouting } from './routed-config-handler';

export class RoutedExecution {
  private router: ExchangeRouter | null = null;
  private config: RoutingConfig | null = null;
  private readonly orderAffinity = new Map<string, ExchangeId>();
  constructor(private readonly deps: RoutedExecutionDeps) {}

  configureRouting(cfg: unknown): Result<void> {
    const res = setupRouting(cfg);
    if (!res.ok) return err(res.error);
    this.router = res.data.router; this.config = res.data.config; this.orderAffinity.clear();
    return ok(undefined);
  }
  isConfigured(): boolean { return this.router !== null && this.config !== null; }
  async fetchTicker(sym: string): Promise<Result<Ticker>> {
    return !this.router || !this.config ? err('Routing not configured — call configureRouting first') : executeRoutedTicker(sym, this.router, this.config, this.deps);
  }
  async placeOrder(req: OrderRequest): Promise<Result<OrderResult>> {
    return !this.router || !this.config ? err('Routing not configured — call configureRouting first') : executeRoutedOrder(req, this.router, this.config, this.deps, this.orderAffinity);
  }
  async cancelOrder(id: string, sym: string): Promise<Result<boolean>> {
    return !this.config ? err('Routing not configured — call configureRouting first') : executeRoutedCancel(id, sym, this.orderAffinity, this.deps.providers, this.deps.reportError);
  }
  async fetchOrder(id: string, sym: string): Promise<Result<OrderResult>> {
    return !this.config ? err('Routing not configured — call configureRouting first') : executeRoutedFetchOrder(id, sym, this.orderAffinity, this.deps.providers, this.deps.reportError);
  }
  getOrderAffinity(id: string): ExchangeId | undefined { return this.orderAffinity.get(id); }
}