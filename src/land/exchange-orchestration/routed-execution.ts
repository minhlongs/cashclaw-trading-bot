// RoutedExecution — cross-exchange routing logic for ExchangeOrchestrator.
// Paper-only: operates on PaperExchangeProvider instances in the orchestrator's
// providers map. Order affinity (orderId -> exchange) pins cancel/fetch to the
// exchange that actually placed the order; orders never failover mid-flight.

export { RoutedExecution } from './routed-execution.core';
export type { RoutedExecutionDeps } from './routed-execution.types';
