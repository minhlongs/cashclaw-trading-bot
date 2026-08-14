// WebSocket Connection — abstract base class with reconnection logic

import type { WsSubscription } from './ws-types';

export abstract class WsConnection {
  protected ws: WebSocket | null = null;
  protected subscriptions = new Map<string, WsSubscription>();
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 5;
  protected reconnectDelayMs = 1000;
  protected connected = false;

  abstract connect(): Promise<void>;
  abstract subscribe(sub: Omit<WsSubscription, 'id'>): string;
  abstract unsubscribe(subId: string): void;
  abstract disconnect(): void;

  protected async ensureConnected(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;
    await this.connect();
  }

  protected scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.ws?.close();
      return;
    }

    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    setTimeout(() => {
      this.ensureConnected().catch(() => {
        // Silently retry — the bot keeps running with cached data
      });
    }, delay);
  }

  protected markConnected(): void {
    this.connected = true;
    this.reconnectAttempts = 0;
    this.reconnectDelayMs = 1000;
  }

  protected markDisconnected(): void {
    this.connected = false;
  }
}
