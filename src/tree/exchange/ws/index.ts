// WebSocket Stream Manager — barrel export
// Manages WebSocket connections per exchange.
// CF Workers constraint: max 6 simultaneous outbound WS connections.
// Solution: Combine streams via exchange's combined endpoint.

export { WsConnection } from './ws-connection';
export { BinanceWsConnection } from './binance-ws-connection';
export { WsManager, wsManager } from './ws-manager';
export type { WsEventType, WsCallback, WsSubscription } from './ws-types';
