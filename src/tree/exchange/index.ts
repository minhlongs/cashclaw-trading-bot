// Exchange Module — barrel export
export { PaperExchange } from './paper';
export type { PaperTrade } from './paper';
export { LiveExchange } from './live';
export { WsConnection, BinanceWsConnection, WsManager, wsManager } from './ws';
export type { WsEventType, WsCallback, WsSubscription } from './ws';
export { CCXTTransformer, createCCXTClient } from './ccxt/client';
export type { CCXTConfig } from './ccxt/client';
export { RateLimiter, rateLimiter } from './rate-limiter';

// Provider abstraction layer (Phase 1-2)
export {
  PaperExchangeProvider,
  CircuitBreaker,
  CircuitOpenError,
} from './provider';
export type {
  ProviderState,
  ProviderHealth,
  ProviderBudget,
  ProviderConfig,
  PaperProviderConfig,
  ExchangeProvider,
} from './provider';
