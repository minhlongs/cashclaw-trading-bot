// Binance Combined Streams WebSocket
// Up to 1024 symbols per connection (wss://stream.binance.com:9443/stream)

import type { Ticker, OrderBook } from '../types';
import type { WsEventType, WsSubscription } from './ws-types';
import { WsConnection } from './ws-connection';
import { createLogger } from '@/lib/logger';
import {
  parseTicker,
  parseOrderBook,
  getBinanceStreamName,
} from './binance-ws-parsers';

export { parseTicker, parseOrderBook, getBinanceStreamName };

const log = createLogger('binance-ws');

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

    const url = `${this.baseUrl}/stream?streams=${this.streams.join('/')}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.markConnected();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.stream && data.data) {
              this.dispatch(data.stream, data.data);
            }
          } catch (error) {
            log.debug('Non-JSON WebSocket message', { action: 'onmessage', error: error instanceof Error ? error.message : String(error) });
          }
        };

        this.ws.onerror = (_error) => {
          for (const [, sub] of this.subscriptions) {
            sub.callback.onError?.(new Error('WebSocket error'));
          }
          this.markDisconnected();
          this.scheduleReconnect();
        };

        this.ws.onclose = () => {
          this.markDisconnected();
          for (const [, sub] of this.subscriptions) {
            sub.callback.onClose?.();
          }
          this.scheduleReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private dispatch(stream: string, data: Record<string, unknown>): void {
    for (const [, sub] of this.subscriptions) {
      if (stream.endsWith(sub.symbol.toLowerCase())) {
        switch (sub.type) {
          case 'ticker':
            if (data.e === '24hrTicker') {
              sub.callback.onTicker?.(this.parseTicker(data));
            }
            break;
          case 'orderbook':
            if (data.e === 'depthUpdate') {
              sub.callback.onOrderBook?.(this.parseOrderBook(data));
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
  }

  private parseTicker(data: Record<string, unknown>): Ticker {
    return parseTicker(data);
  }

  private parseOrderBook(data: Record<string, unknown>): OrderBook {
    return parseOrderBook(data);
  }

  subscribe(sub: Omit<WsSubscription, 'id'>): string {
    const id = `binance_${sub.symbol}_${sub.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.subscriptions.set(id, { ...sub, id });
    this.streams.push(`${sub.type}@${this.getBinanceStreamName(sub.type, sub.symbol)}`);
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

    const streamKey = `${sub.type}@${this.getBinanceStreamName(sub.type, sub.symbol)}`;
    this.streams = this.streams.filter((s) => s !== streamKey);
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
