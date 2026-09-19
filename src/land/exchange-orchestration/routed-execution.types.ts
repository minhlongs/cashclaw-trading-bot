// RoutedExecution — cross-exchange routing logic for ExchangeOrchestrator.
// Paper-only: operates on PaperExchangeProvider instances in the orchestrator's
// providers map. Order affinity (orderId -> exchange) pins cancel/fetch to the
// exchange that actually placed the order; orders never failover mid-flight.

import type { PaperExchangeProvider, ProviderResult } from '@/tree/exchange/provider';
import type { Ticker, OrderResult } from '@/tree/exchange/types';

export interface RoutedExecutionDeps {
  providers: Map<string, PaperExchangeProvider>;
  killswitch: { isTradingEnabled(): boolean };
  onProvenance: (exchange: string, result: ProviderResult<Ticker | OrderResult>) => void;
  reportError: (error: Error, ctx: string) => void;
}
