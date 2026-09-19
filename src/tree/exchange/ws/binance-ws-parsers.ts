// Binance WebSocket payload parsers and stream name resolver.
// Pure functions: deterministic mapping of Binance payload objects to domain models.

import type { Ticker, OrderBook } from '../types';
import type { WsEventType } from './ws-types';

/**
 * Parse Binance 24hrTicker payload into domain Ticker.
 */
export function parseTicker(data: Record<string, unknown>): Ticker {
  return {
    symbol: data.s as string,
    last: Number(data.c),
    bid: Number(data.b),
    ask: Number(data.a),
    high24h: Number(data.h),
    low24h: Number(data.l),
    volume24h: Number(data.v),
    timestamp: Number(data.E),
  };
}

/**
 * Parse Binance depthUpdate payload into domain OrderBook.
 */
export function parseOrderBook(data: Record<string, unknown>): OrderBook {
  return {
    symbol: data.s as string,
    bids: (data.b as [number, string][])?.map(([p, q]) => ({ price: p, quantity: Number(q) })) ?? [],
    asks: (data.a as [number, string][])?.map(([p, q]) => ({ price: p, quantity: Number(q) })) ?? [],
    timestamp: Number(data.E),
  };
}

/**
 * Resolve the Binance stream identifier for a given event type and symbol.
 */
export function getBinanceStreamName(type: WsEventType, symbol: string): string {
  const sym = symbol.toLowerCase().replace('/', '');
  switch (type) {
    case 'ticker':
      return `${sym}@ticker`;
    case 'orderbook':
      return `${sym}@depth20@100ms`;
    case 'trade':
      return `${sym}@trade`;
    case 'kline':
      return `${sym}@kline_1m`;
    default:
      return sym;
  }
}
