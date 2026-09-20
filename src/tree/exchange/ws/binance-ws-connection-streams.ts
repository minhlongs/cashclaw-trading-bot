// Binance Combined Streams WebSocket — subscription/stream lifecycle.
// Pure subscription bookkeeping: subscribe, unsubscribe, rebuildStreams, and
// disconnect. No WebSocket I/O itself; the facade owns `this.ws`.

import type { Ticker, OrderBook } from '../types';
import type { WsEventType, WsSubscription } from './ws-types';
import { parseTicker, parseOrderBook, getBinanceStreamName } from './binance-ws-parsers';

/** Build a unique subscription id. */
export function buildSubscriptionId(
  symbol: string,
  type: WsEventType,
  now: number = Date.now(),
  nonce = Math.random().toString(36).slice(2, 8),
): string {
  return `binance_${symbol}_${type}_${now}_${nonce}`;
}

/** Compute the stream key for a given subscription. */
export function streamKeyFor(type: WsEventType, symbol: string): string {
  return `${type}@${getBinanceStreamName(type, symbol)}`;
}

/** Parse raw Binance 24hrTicker payload via tree-layer parser. */
export function parseTickerPayload(data: Record<string, unknown>): Ticker {
  return parseTicker(data);
}

/** Parse raw Binance depthUpdate payload via tree-layer parser. */
export function parseOrderBookPayload(data: Record<string, unknown>): OrderBook {
  return parseOrderBook(data);
}

/**
 * Reconcile the streams array against the current subscriptions after
 * subscribe/unsubscribe. Returns the new array of stream keys (deduped,
 * insertion-stable).
 */
export function rebuildStreamsFromSubs(subs: Pick<WsSubscription, 'type' | 'symbol'>[]): string[] {
  const out: string[] = [];
  for (const sub of subs) {
    const key = streamKeyFor(sub.type, sub.symbol);
    out.push(key);
  }
  return out;
}

/**
 * Dispatch a parsed Binance envelope to the matching subscription callback.
 * Matches by `stream.endsWith(symbol.toLowerCase())` and the `data.e` event
 * tag per WsEventType.
 */
export function dispatchEnvelope(
  stream: string,
  data: Record<string, unknown>,
  subscriptions: Map<string, WsSubscription>,
): void {
  for (const [, sub] of subscriptions) {
    if (!stream.endsWith(sub.symbol.toLowerCase())) continue;
    switch (sub.type) {
      case 'ticker':
        if (data.e === '24hrTicker') {
          sub.callback.onTicker?.(parseTickerPayload(data));
        }
        break;
      case 'orderbook':
        if (data.e === 'depthUpdate') {
          sub.callback.onOrderBook?.(parseOrderBookPayload(data));
        }
        break;
      case 'trade':
        if (data.e === 'trade') {
          sub.callback.onTrade?.(data);
        }
        break;
      case 'kline':
        if (data.e === 'kline') {
          sub.callback.onKline?.(data);
        }
        break;
    }
  }
}
