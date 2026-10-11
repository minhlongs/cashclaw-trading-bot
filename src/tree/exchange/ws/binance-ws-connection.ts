import type { Ticker, OrderBook } from '../types';
import type { WsEventType, WsSubscription } from './ws-types';
import { WsConnection } from './ws-connection';
import { parseTicker, parseOrderBook, getBinanceStreamName } from './binance-ws-parsers';
import { buildCombinedStreamUrl, assignWsHandlers } from './binance-ws-connection-handlers';
import { buildSubscriptionId, streamKeyFor, dispatchEnvelope } from './binance-ws-connection-streams';
import { openWs, rebuildWs } from './binance-ws-lifecycle';
import { subscribeStream, unsubscribeStream } from './binance-ws-subscription';
export { parseTicker, parseOrderBook, getBinanceStreamName, buildCombinedStreamUrl, assignWsHandlers, buildSubscriptionId, streamKeyFor, dispatchEnvelope };

export class BinanceWsConnection extends WsConnection {
  private streams: string[] = []; private baseUrl: string;
  constructor(testnet = false) {
    super(); this.baseUrl = testnet ? 'wss://stream.testnet.binance.vision:9443' : 'wss://stream.binance.com:9443';
  }
  async connect(): Promise<void> {
    if (this.streams.length === 0) throw new Error('No streams subscribed');
    return openWs(buildCombinedStreamUrl(this.baseUrl, this.streams), {
      markConnected: () => this.markConnected(), markDisconnected: () => this.markDisconnected(), scheduleReconnect: () => this.scheduleReconnect(),
      dispatch: (s, d) => dispatchEnvelope(s, d, this.subscriptions), subscriptions: this.subscriptions, setWs: (w) => { this.ws = w; },
    });
  }
  private parseTicker(d: Record<string, unknown>): Ticker { return parseTicker(d); }
  private parseOrderBook(d: Record<string, unknown>): OrderBook { return parseOrderBook(d); }
  private getBinanceStreamName(t: WsEventType, s: string): string { return getBinanceStreamName(t, s); }
  subscribe(sub: Omit<WsSubscription, 'id'>): string { return subscribeStream(this.subscriptions, this.streams, sub, () => { void this.rebuildStreams(); }); }
  private async rebuildStreams(): Promise<void> { await rebuildWs(this.ws, this.connected, this.streams, () => this.connect()); }
  unsubscribe(id: string): void { this.streams = unsubscribeStream(this.subscriptions, this.streams, id, () => this.disconnect(), () => { void this.rebuildStreams(); }); }
  disconnect(): void { this.subscriptions.clear(); this.streams = []; this.connected = false; this.ws?.close(); this.ws = null; }
}
