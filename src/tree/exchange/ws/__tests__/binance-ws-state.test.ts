import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BinanceWsConnection } from '../binance-ws-connection';
import {
  MockWebSocket,
  setupWsTestEnvironment,
  teardownWsTestEnvironment,
  subscribeAndOpen,
} from './binance-ws-test-utils';

describe('BinanceWsConnection — Error Handling & State', () => {
  beforeEach(() => {
    setupWsTestEnvironment();
  });

  afterEach(() => {
    teardownWsTestEnvironment();
  });

  // ── WebSocket error handling ────────────────────────────────
  describe('WebSocket error handling', () => {
    it('calls onError on all subscribers', () => {
      const conn = new BinanceWsConnection();
      const { sub: sub1 } = subscribeAndOpen(conn, { symbol: 'BTCUSDT' });
      const { sub: sub2 } = subscribeAndOpen(conn, { symbol: 'ETHUSDT' });
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateError();

      expect(sub1.callback.onError).toHaveBeenCalledTimes(1);
      expect(sub2.callback.onError).toHaveBeenCalledTimes(1);
    });
  });

  // ── disconnect ──────────────────────────────────────────────
  describe('disconnect', () => {
    it('clears subscriptions, streams, and ws', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn);
      expect(conn['subscriptions'].size).toBe(1);

      conn.disconnect();

      expect(conn['subscriptions'].size).toBe(0);
      expect(conn['streams']).toEqual([]);
      expect(conn['connected']).toBe(false);
      expect(conn['ws']).toBeNull();
    });

    it('closes the WebSocket', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn);
      const ws = MockWebSocket.instances[0];
      const closeSpy = vi.spyOn(ws, 'close');

      conn.disconnect();

      expect(closeSpy).toHaveBeenCalled();
      expect(ws.readyState).toBe(3);
    });

    it('does not throw when ws is already null', () => {
      const conn = new BinanceWsConnection();
      expect(() => conn.disconnect()).not.toThrow();
    });
  });

  // ── connection state ────────────────────────────────────────
  describe('connection state', () => {
    it('resets reconnect attempts on markConnected', () => {
      const conn = new BinanceWsConnection();
      conn['reconnectAttempts'] = 3;
      conn['markConnected']();
      expect(conn['reconnectAttempts']).toBe(0);
      expect(conn['connected']).toBe(true);
    });

    it('sets connected=false on markDisconnected', () => {
      const conn = new BinanceWsConnection();
      conn['connected'] = true;
      conn['markDisconnected']();
      expect(conn['connected']).toBe(false);
    });
  });
});
