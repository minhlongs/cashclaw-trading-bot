// Provider barrel — exchange abstraction layer exports
export type {
  ProviderState,
  ProviderHealth,
  ProviderBudget,
  ProviderConfig,
  PaperProviderConfig,
  ExchangeProvider,
} from './types';
export { PaperExchangeProvider } from './paper-provider';
export { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
export { ProviderChain } from './provider';
export type { FailureKind } from './circuit-breaker-kinds';
export { FAILURE_KIND_THRESHOLDS, classifyFailure } from './circuit-breaker-kinds';
export type { LoadedCircuitState } from './circuit-persistence';
export { saveState, loadState } from './circuit-persistence';
export type { ProviderResult, Provider, TickerProvider, OrderProvider } from './provider';
export { RequestQueue, CostTracker, QueuedExchangeAdapter } from '../queue';
export { RequestPriority, PRIORITY_LABELS, DEFAULT_QUEUE_CONFIG } from '../queue';
export type { QueueItem, QueueConfig, DrainResult, QueuedAdapterDeps } from '../queue';
