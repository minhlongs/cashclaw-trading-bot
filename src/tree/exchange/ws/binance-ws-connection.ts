// Binance Combined Streams WebSocket
// Up to 1024 symbols per connection (wss://stream.binance.com:9443/stream)

import type { Ticker, OrderBook } from '../types';
import type { WsEventType, WsSubscription } from './ws-types';
import { WsConnection } from './ws-connection';
import {
  parseTicker,
  parseOrderBook,
  getBinanceStreamName,
} from './binance-ws-parsers';
import { buildCombinedStreamUrl, assignWsHandlers } from './binance-ws-connection-handlers';
import {
  buildSubscriptionId,
  streamKeyFor,
  dispatchEnvelope,
} from './binance-ws-connection-streams';

export { parseTicker, parseOrderBook, getBinanceStreamName };
export { buildCombinedStreamUrl, assignWsHandlers } from './binance-ws-connection-handlers';
export {
  buildSubscriptionId,
  streamKeyFor,
  dispatchEnvelope,
} from './binance-ws-connection-streams';

export class BinanceWsConnection extends WsConnection {
  private streams: string[] = [];
  private baseUrl: string;

  constructor(testnet = false) {
    super();
    this.baseUrl = testnet
      ? 'wss://stream.testnet.binance.vision:9443'
      : 'wss://stream.binance.com:9443';
  }

  async connect(): Promise<void> {
    if (this.streams.length === 0) {
      throw new Error('No streams subscribed');
    }
    const url = buildCombinedStreamUrl(this.baseUrl, this.streams);
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
        assignWsHandlers({
          ws: this.ws,
          markConnected: () => this.markConnected(),
          onErrorNotify: () => {
            for (const [, s] of this.subscriptions) s.callback.onError?.(new Error('WebSocket error'));
            this.markDisconnected();
          },
          onCloseNotify: () => {
            this.markDisconnected();
            for (const [, s] of this.subscriptions) s.callback.onClose?.();
          },
          onMessageDispatch: (stream, data) => this.dispatch(stream, data),
          scheduleReconnect: () => this.scheduleReconnect(),
          resolveOpen: () => resolve(),
          rejectOpen: (err) => reject(err),
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private dispatch(stream: string, data: Record<string, unknown>): void {
    dispatchEnvelope(stream, data, this.subscriptions);
  }

  private parseTicker(data: Record<string, unknown>): Ticker {
    return parseTicker(data);
  }

  private parseOrderBook(data: Record<string, unknown>): OrderBook {
    return parseOrderBook(data);
  }

  subscribe(sub: Omit<WsSubscription, 'id'>): string {
    const id = buildSubscriptionId(sub.symbol, sub.type);
    this.subscriptions.set(id, { ...sub, id });
    this.streams.push(streamKeyFor(sub.type, sub.symbol));
    this.rebuildStreams();
    return id;
  }

  private getBinanceStreamName(type: WsEventType, symbol: string): string {
    return getBinanceStreamName(type, symbol);
  }

  private async rebuildStreams(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    if (this.streams.length > 0) {
      this.connect().catch(() => { /* retry handled by scheduler */ });
    }
  }

  unsubscribe(subId: string): void {
    const sub = this.subscriptions.get(subId);
    if (!sub) return;
    this.streams = this.streams.filter((s) => s !== streamKeyFor(sub.type, sub.symbol));
    this.subscriptions.delete(subId);
    if (this.streams.length === 0) {
      this.disconnect();
    } else {
      this.rebuildStreams();
    }
  }

  disconnect(): void {
    this.subscriptions.clear();
    this.streams = [];
    this.connected = false;
    this.ws?.close();
    this.ws = null;
  }
}
