// Paper Trading Adapter
// Simulates live exchange behavior using local state — no real money.
// Uses real market data for pricing, but simulated order execution.

export type {
  MarketDataFetcher,
  PaperExchangeOptions,
  PaperTrade,
} from './paper-types';
export {
  createPaperTrade,
  mapTradeToOrderResult,
} from './paper-order-helpers';
export { PaperExchange } from './paper-exchange';
