import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BinanceWsConnection } from '../binance-ws-connection';
import {
  setupWsTestEnvironment,
  teardownWsTestEnvironment,
} from './binance-ws-test-utils';

describe('BinanceWsConnection — Message Parsing', () => {
  beforeEach(() => {
    setupWsTestEnvironment();
  });

  afterEach(() => {
    teardownWsTestEnvironment();
  });

  // ── parseTicker (private, tested directly) ──────────────────
  describe('parseTicker', () => {
    it('parses Binance 24hrTicker fields into Ticker', () => {
      const conn = new BinanceWsConnection();
      const ticker = conn['parseTicker']({
        s: 'BTCUSDT',
        c: '50000.50',
        b: '49999.00',
        a: '50001.00',
        h: '51000.00',
        l: '49000.00',
        v: '1234.56',
        E: 1690000000000,
      });

      expect(ticker.symbol).toBe('BTCUSDT');
      expect(ticker.last).toBe(50000.5);
      expect(ticker.bid).toBe(49999);
      expect(ticker.ask).toBe(50001);
      expect(ticker.high24h).toBe(51000);
      expect(ticker.low24h).toBe(49000);
      expect(ticker.volume24h).toBe(1234.56);
      expect(ticker.timestamp).toBe(1690000000000);
    });

    it('handles zero values', () => {
      const conn = new BinanceWsConnection();
      const ticker = conn['parseTicker']({
        s: 'BTCUSDT',
        c: '0',
        b: '0',
        a: '0',
        h: '0',
        l: '0',
        v: '0',
        E: 0,
      });
      expect(ticker.last).toBe(0);
      expect(ticker.volume24h).toBe(0);
    });

    it('handles large numbers', () => {
      const conn = new BinanceWsConnection();
      const ticker = conn['parseTicker']({
        s: 'BTCUSDT',
        c: '999999.99',
        b: '999998',
        a: '1000001',
        h: '999999.99',
        l: '1',
        v: '100000000',
        E: 9999999999999,
      });
      expect(ticker.last).toBe(999999.99);
      expect(ticker.volume24h).toBe(100000000);
    });
  });

  // ── parseOrderBook (private, tested directly) ───────────────
  describe('parseOrderBook', () => {
    it('parses Binance depthUpdate fields into OrderBook', () => {
      const conn = new BinanceWsConnection();
      const book = conn['parseOrderBook']({
        s: 'BTCUSDT',
        b: [
          [49999, '1.5'],
          [49998, '2.0'],
        ],
        a: [
          ['50001.00', '1.0'],
          ['50002.00', '3.0'],
        ],
        E: 1690000000000,
      });

      expect(book.symbol).toBe('BTCUSDT');
      expect(book.bids).toEqual([
        { price: 49999, quantity: 1.5 },
        { price: 49998, quantity: 2 },
      ]);
      expect(book.asks).toEqual([
        { price: '50001.00', quantity: 1 },
        { price: '50002.00', quantity: 3 },
      ]);
      expect(book.timestamp).toBe(1690000000000);
    });

    it('handles empty bid/ask arrays', () => {
      const conn = new BinanceWsConnection();
      const book = conn['parseOrderBook']({ s: 'BTCUSDT', b: [], a: [], E: 0 });
      expect(book.bids).toEqual([]);
      expect(book.asks).toEqual([]);
    });

    it('handles missing bid/ask gracefully', () => {
      const conn = new BinanceWsConnection();
      const book = conn['parseOrderBook']({ s: 'BTCUSDT', E: 0 });
      expect(book.bids).toEqual([]);
      expect(book.asks).toEqual([]);
      expect(book.timestamp).toBe(0);
    });

    it('parses many price levels', () => {
      const conn = new BinanceWsConnection();
      const bids = Array.from({ length: 20 }, (_, i) => [50000 - i, `${i + 1}`]);
      const book = conn['parseOrderBook']({ s: 'BTCUSDT', b: bids, a: [], E: 0 });
      expect(book.bids).toHaveLength(20);
      expect(book.bids[0].price).toBe(50000);
      expect(book.bids[19].price).toBe(49981);
    });
  });
});
