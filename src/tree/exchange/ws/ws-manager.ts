// WebSocket Manager — singleton connection pool
// Enforces the 6-WS limit by batching into exchange's combined endpoints.

import type { WsSubscription } from './ws-types';
import { WsConnection } from './ws-connection';
import { BinanceWsConnection } from './binance-ws-connection';

export class WsManager {
  private connections = new Map<string, WsConnection>();
  private maxConnections = 6;
  private globalSubs = new Map<string, { sub: WsSubscription; connectionKey: string }>();

  async subscribe(sub: Omit<WsSubscription, 'id'>): Promise<string> {
    const connKey = `${sub.exchange}:${sub.type}`;
    let conn = this.connections.get(connKey);

    if (!conn) {
      if (this.connections.size >= this.maxConnections) {
        throw new Error('Max WebSocket connections reached (6)');
      }

      conn = this.createConnection(sub.exchange);
      this.connections.set(connKey, conn);
      await conn.connect();
    }

    const id = conn.subscribe(sub);
    this.globalSubs.set(id, { sub: { ...sub, id }, connectionKey: connKey });
    return id;
  }

  private createConnection(exchange: string): WsConnection {
    switch (exchange.toLowerCase()) {
      case 'binance':
        return new BinanceWsConnection();
      default:
        throw new Error(`Unsupported exchange for WS: ${exchange}`);
    }
  }

  unsubscribe(subId: string): void {
    const entry = this.globalSubs.get(subId);
    if (!entry) return;

    const conn = this.connections.get(entry.connectionKey);
    conn?.unsubscribe(subId);
    this.globalSubs.delete(subId);
  }

  disconnectAll(): void {
    for (const [, conn] of this.connections) {
      conn.disconnect();
    }
    this.connections.clear();
    this.globalSubs.clear();
  }

  getActiveConnectionCount(): number {
    return this.connections.size;
  }
}

// Singleton
export const wsManager = new WsManager();
