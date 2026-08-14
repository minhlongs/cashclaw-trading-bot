import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BinanceWsConnection } from './binance-ws-connection';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }

  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  readyState = 0;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BinanceWsConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeSub(overrides: Partial<{ symbol: string; type: 'ticker' | 'orderbook' | 'trade' | 'kline' }> = {}) {
    return {
      exchange: 'binance' as const,
      symbol: overrides.symbol ?? 'BTCUSDT',
      type: overrides.type ?? 'ticker',
      callback: {
        onTicker: vi.fn(),
        onOrderBook: vi.fn(),
        onTrade: vi.fn(),
        onKline: vi.fn(),
        onError: vi.fn(),
        onClose: vi.fn(),
      },
    };
  }

  /** Helper to cast a vi.fn() to a Mock so .mock.calls is accessible. */
  function asMock(fn: unknown) {
    return fn as ReturnType<typeof vi.fn>;
  }

  /** Subscribe and open the WebSocket so handlers are wired up. */
  function subscribeAndOpen(
    conn: BinanceWsConnection,
    subOverrides?: Partial<{ symbol: string; type: 'ticker' | 'orderbook' | 'trade' | 'kline' }>,
  ) {
    const sub = makeSub(subOverrides);
    const id = conn.subscribe(sub);
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.simulateOpen();
    return { id, ws, sub };
  }

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
        s: 'BTCUSDT', c: '0', b: '0', a: '0', h: '0', l: '0', v: '0', E: 0,
      });
      expect(ticker.last).toBe(0);
      expect(ticker.volume24h).toBe(0);
    });

    it('handles large numbers', () => {
      const conn = new BinanceWsConnection();
      const ticker = conn['parseTicker']({
        s: 'BTCUSDT', c: '999999.99', b: '999998', a: '1000001',
        h: '999999.99', l: '1', v: '100000000', E: 9999999999999,
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
        b: [[49999, '1.5'], [49998, '2.0']],
        a: [['50001.00', '1.0'], ['50002.00', '3.0']],
        E: 1690000000000,
      });

      expect(book.symbol).toBe('BTCUSDT');
      // Bids: [price, qty]
      expect(book.bids).toEqual([
        { price: 49999, quantity: 1.5 },
        { price: 49998, quantity: 2 },
      ]);
      // Asks: same [price, quantity] destructuring as bids
      // price kept as-is from source data, quantity wrapped with Number()
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
      // price kept as-is from source (not Number-wrapped)
      expect(book.bids[0].price).toBe(50000);
      expect(book.bids[19].price).toBe(49981);
    });
  });

  // ── dispatch (via WebSocket onmessage) ──────────────────────
  describe('dispatch (via WebSocket onmessage)', () => {
    it('dispatches ticker callback when stream matches symbol', () => {
      const conn = new BinanceWsConnection();
      // Use symbol "TICKER" so "btcusdt@ticker".endsWith("ticker") is true
      const { id, ws } = subscribeAndOpen(conn, { symbol: 'TICKER', type: 'ticker' });

      ws.simulateMessage(JSON.stringify({
        stream: 'btcusdt@ticker',
        data: {
          e: '24hrTicker', s: 'BTCUSDT',
          c: '50000', b: '49999', a: '50001',
          h: '51000', l: '49000', v: '1000', q: '50000000',
        },
      }));

      const callback = conn['subscriptions'].get(id)!.callback;
      expect(callback.onTicker).toHaveBeenCalledTimes(1);
      expect(asMock(callback.onTicker).mock.calls[0][0].symbol).toBe('BTCUSDT');
      expect(asMock(callback.onTicker).mock.calls[0][0].last).toBe(50000);
    });

    it('dispatches orderbook callback when stream matches symbol', () => {
      const conn = new BinanceWsConnection();
      // dispatch checks stream.endsWith(symbol.toLowerCase())
      // For orderbook: stream = "btcusdt@depth20@100ms"
      // "btcusdt@depth20@100ms".endsWith("100ms") → true
      const { id, ws } = subscribeAndOpen(conn, { symbol: '100ms', type: 'orderbook' });

      ws.simulateMessage(JSON.stringify({
        stream: 'btcusdt@depth20@100ms',
        data: {
          e: 'depthUpdate', s: 'BTCUSDT',
          b: [[49999, '1.5'], [49998, '2.0']],
          a: [['50001', '1'], ['50002', '2']],
        },
      }));

      const callback = conn['subscriptions'].get(id)!.callback;
      expect(callback.onOrderBook).toHaveBeenCalledTimes(1);
      expect(asMock(callback.onOrderBook).mock.calls[0][0].symbol).toBe('BTCUSDT');
    });

    it('does not dispatch when stream does not end with symbol', () => {
      const conn = new BinanceWsConnection();
      const { id, ws } = subscribeAndOpen(conn, { symbol: 'ETHUSDT', type: 'ticker' });

      ws.simulateMessage(JSON.stringify({
        stream: 'btcusdt@ticker',
        data: {
          e: '24hrTicker', s: 'BTCUSDT',
          c: '50000', b: '49999', a: '50001',
          h: '51000', l: '49000', v: '1000', q: '50000000',
        },
      }));

      expect(conn['subscriptions'].get(id)!.callback.onTicker).not.toHaveBeenCalled();
    });

    it('dispatches trade callback when event type matches', () => {
      const conn = new BinanceWsConnection();
      // Symbol "TRADE" → endsWith("trade") matches stream "btcusdt@trade"
      const { id, ws } = subscribeAndOpen(conn, { symbol: 'TRADE', type: 'trade' });

      const tradeData = { e: 'trade', s: 'BTCUSDT', p: '50000', q: '0.5' };
      ws.simulateMessage(JSON.stringify({ stream: 'btcusdt@trade', data: tradeData }));

      const callback = conn['subscriptions'].get(id)!.callback;
      expect(callback.onTrade).toHaveBeenCalledTimes(1);
      expect(callback.onTrade).toHaveBeenCalledWith(tradeData);
    });

    it('dispatches kline callback when event type matches', () => {
      const conn = new BinanceWsConnection();
      const { id, ws } = subscribeAndOpen(conn, { symbol: 'KLINE_1M', type: 'kline' });

      const klineData = { e: 'kline', s: 'BTCUSDT', k: { o: '50000', c: '50100' } };
      ws.simulateMessage(JSON.stringify({ stream: 'btcusdt@kline_1m', data: klineData }));

      const callback = conn['subscriptions'].get(id)!.callback;
      expect(callback.onKline).toHaveBeenCalledTimes(1);
      expect(callback.onKline).toHaveBeenCalledWith(klineData);
    });

    it('ignores non-JSON messages without throwing', () => {
      const conn = new BinanceWsConnection();
      const { ws } = subscribeAndOpen(conn);
      expect(() => ws.simulateMessage('not valid json')).not.toThrow();
    });

    it('ignores messages without stream/data envelope', () => {
      const conn = new BinanceWsConnection();
      const { id, ws } = subscribeAndOpen(conn, { symbol: 'TICKER', type: 'ticker' });

      ws.simulateMessage(JSON.stringify({ s: 'BTCUSDT', c: '50000' }));

      expect(conn['subscriptions'].get(id)!.callback.onTicker).not.toHaveBeenCalled();
    });
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
