// Paper Trading Adapter: domain types.
// Simulated exchange state models.

import type {
  ExchangeId,
  Ticker,
  OrderStatus,
  Side,
  OrderType,
} from '../types';

export type MarketDataFetcher = (exchangeId: ExchangeId, symbol: string) => Promise<Ticker>;

export interface PaperExchangeOptions {
  tickerFetcher?: MarketDataFetcher;
}

export interface PaperTrade {
  orderId: string;
  exchangeId: ExchangeId;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number;
  quantity: number;
  filled: number;
  status: OrderStatus;
  fee: number;
  timestamp: number;
}
