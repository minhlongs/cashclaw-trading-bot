// WebSocket Stream Types

import type { Ticker, OrderBook } from '../types';

export type WsEventType = 'ticker' | 'orderbook' | 'trade' | 'kline';

export interface WsCallback {
  onTicker?: (ticker: Ticker) => void;
  onOrderBook?: (book: OrderBook) => void;
  onTrade?: (trade: unknown) => void;
  onKline?: (kline: unknown) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface WsSubscription {
  id: string;
  exchange: string;
  type: WsEventType;
  symbol: string;
  callback: WsCallback;
}
