import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BinanceWsConnection } from '../binance-ws-connection';
import {
  MockWebSocket,
  setupWsTestEnvironment,
  teardownWsTestEnvironment,
  subscribeAndOpen,
} from './binance-ws-test-utils';

describe('BinanceWsConnection — Lifecycle & Subscriptions', () => {
  beforeEach(() => {
    setupWsTestEnvironment();
  });

  afterEach(() => {
    teardownWsTestEnvironment();
  });

  // ── constructor ─────────────────────────────────────────────
  describe('constructor', () => {
    it('defaults to production base URL', () => {
      const conn = new BinanceWsConnection();
      expect(conn['baseUrl']).toBe('wss://stream.binance.com:9443');
    });

    it('uses testnet base URL when testnet=true', () => {
      const conn = new BinanceWsConnection(true);
      expect(conn['baseUrl']).toBe('wss://stream.testnet.binance.vision:9443');
    });
  });

  // ── getBinanceStreamName ────────────────────────────────────
  describe('getBinanceStreamName', () => {
    it('ticker → btcusdt@ticker', () => {
      const conn = new BinanceWsConnection();
      expect(conn['getBinanceStreamName']('ticker', 'btcusdt')).toBe('btcusdt@ticker');
    });

    it('orderbook → btcusdt@depth20@100ms', () => {
      const conn = new BinanceWsConnection();
      expect(conn['getBinanceStreamName']('orderbook', 'btcusdt')).toBe('btcusdt@depth20@100ms');
    });

    it('trade → btcusdt@trade', () => {
      const conn = new BinanceWsConnection();
      expect(conn['getBinanceStreamName']('trade', 'btcusdt')).toBe('btcusdt@trade');
    });

    it('kline → btcusdt@kline_1m', () => {
      const conn = new BinanceWsConnection();
      expect(conn['getBinanceStreamName']('kline', 'btcusdt')).toBe('btcusdt@kline_1m');
    });

    it('lowercases symbol', () => {
      const conn = new BinanceWsConnection();
      expect(conn['getBinanceStreamName']('ticker', 'ETHUSDT')).toBe('ethusdt@ticker');
    });

    it('strips slashes from symbol', () => {
      const conn = new BinanceWsConnection();
      expect(conn['getBinanceStreamName']('ticker', 'ETH/USDT')).toBe('ethusdt@ticker');
    });
  });

  // ── subscribe ───────────────────────────────────────────────
  describe('subscribe', () => {
    it('returns an id string starting with binance_', () => {
      const conn = new BinanceWsConnection();
      const { id } = subscribeAndOpen(conn);
      expect(id).toMatch(/^binance_/);
    });

    it('stores subscription with correct symbol and type', () => {
      const conn = new BinanceWsConnection();
      const { id, sub } = subscribeAndOpen(conn, { symbol: 'ETHUSDT', type: 'orderbook' });
      const stored = conn['subscriptions'].get(id)!;
      expect(stored.symbol).toBe('ETHUSDT');
      expect(stored.type).toBe('orderbook');
      expect(stored.callback).toBe(sub.callback);
    });

    it('adds stream name to streams array', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn);
      expect(conn['streams']).toHaveLength(1);
      expect(conn['streams'][0]).toContain('btcusdt');
      expect(conn['streams'][0]).toContain('ticker');
    });

    it('adds multiple streams for different symbols', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn, { symbol: 'BTCUSDT' });
      subscribeAndOpen(conn, { symbol: 'ETHUSDT', type: 'trade' });
      expect(conn['streams']).toHaveLength(2);
      expect(conn['streams'][0]).toContain('btcusdt');
      expect(conn['streams'][1]).toContain('ethusdt');
    });

    it('generates unique ids', () => {
      const conn = new BinanceWsConnection();
      const { id: id1 } = subscribeAndOpen(conn, { symbol: 'BTCUSDT' });
      const { id: id2 } = subscribeAndOpen(conn, { symbol: 'ETHUSDT' });
      expect(id1).not.toBe(id2);
    });
  });

  // ── unsubscribe ─────────────────────────────────────────────
  describe('unsubscribe', () => {
    it('removes subscription and stream', () => {
      const conn = new BinanceWsConnection();
      const { id } = subscribeAndOpen(conn);
      expect(conn['subscriptions'].size).toBe(1);
      conn.unsubscribe(id);
      expect(conn['subscriptions'].size).toBe(0);
      expect(conn['streams']).toHaveLength(0);
    });

    it('rebuilds streams when other subscriptions remain', () => {
      const conn = new BinanceWsConnection();
      const { id: id1 } = subscribeAndOpen(conn, { symbol: 'BTCUSDT' });
      const { id: id2 } = subscribeAndOpen(conn, { symbol: 'ETHUSDT', type: 'trade' });
      expect(conn['streams']).toHaveLength(2);

      conn['connected'] = true;
      conn.unsubscribe(id1);
      expect(conn['subscriptions'].size).toBe(1);
      expect(conn['streams']).toHaveLength(1);
      expect(conn['streams'][0]).toContain('ethusdt');
      expect(conn['subscriptions'].has(id2)).toBe(true);
    });

    it('does nothing for unknown id', () => {
      const conn = new BinanceWsConnection();
      expect(() => conn.unsubscribe('unknown')).not.toThrow();
    });
  });

  // ── connect ─────────────────────────────────────────────────
  describe('connect', () => {
    it('throws when no streams subscribed', async () => {
      const conn = new BinanceWsConnection();
      await expect(conn.connect()).rejects.toThrow('No streams subscribed');
    });

    it('creates WebSocket with combined streams URL', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn, { symbol: 'BTCUSDT' });
      const wsUrl = MockWebSocket.instances[0].url;
      expect(wsUrl).toContain('stream.binance.com:9443/stream?streams=');
      expect(wsUrl).toContain('btcusdt');
    });

    it('joins multiple streams with slash', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn, { symbol: 'BTCUSDT', type: 'ticker' });
      subscribeAndOpen(conn, { symbol: 'ETHUSDT', type: 'orderbook' });
      const wsUrl = MockWebSocket.instances[0].url;
      expect(wsUrl).toContain('/');
    });

    it('sets connected=true after WebSocket opens', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn);
      expect(conn['connected']).toBe(true);
    });

    it('stores ws reference', () => {
      const conn = new BinanceWsConnection();
      subscribeAndOpen(conn);
      expect(conn['ws']).toBe(MockWebSocket.instances[0]);
    });
  });
});
