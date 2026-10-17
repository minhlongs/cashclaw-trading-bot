import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BinanceWsConnection } from '../binance-ws-connection';
import {
  setupWsTestEnvironment,
  teardownWsTestEnvironment,
  subscribeAndOpen,
  asMock,
} from './binance-ws-test-utils';

describe('BinanceWsConnection — Message Dispatch', () => {
  beforeEach(() => {
    setupWsTestEnvironment();
  });

  afterEach(() => {
    teardownWsTestEnvironment();
  });

  describe('dispatch (via WebSocket onmessage)', () => {
    it('dispatches ticker callback when stream matches symbol', () => {
      const conn = new BinanceWsConnection();
      const { id, ws } = subscribeAndOpen(conn, { symbol: 'TICKER', type: 'ticker' });

      ws.simulateMessage(
        JSON.stringify({
          stream: 'btcusdt@ticker',
          data: {
            e: '24hrTicker',
            s: 'BTCUSDT',
            c: '50000',
            b: '49999',
            a: '50001',
            h: '51000',
            l: '49000',
            v: '1000',
            q: '50000000',
          },
        })
      );

      const callback = conn['subscriptions'].get(id)!.callback;
      expect(callback.onTicker).toHaveBeenCalledTimes(1);
      expect(asMock(callback.onTicker).mock.calls[0][0].symbol).toBe('BTCUSDT');
      expect(asMock(callback.onTicker).mock.calls[0][0].last).toBe(50000);
    });

    it('dispatches orderbook callback when stream matches symbol', () => {
      const conn = new BinanceWsConnection();
      const { id, ws } = subscribeAndOpen(conn, { symbol: '100ms', type: 'orderbook' });

      ws.simulateMessage(
        JSON.stringify({
          stream: 'btcusdt@depth20@100ms',
          data: {
            e: 'depthUpdate',
            s: 'BTCUSDT',
            b: [
              [49999, '1.5'],
              [49998, '2.0'],
            ],
            a: [
              ['50001', '1'],
              ['50002', '2'],
            ],
          },
        })
      );

      const callback = conn['subscriptions'].get(id)!.callback;
      expect(callback.onOrderBook).toHaveBeenCalledTimes(1);
      expect(asMock(callback.onOrderBook).mock.calls[0][0].symbol).toBe('BTCUSDT');
    });

    it('does not dispatch when stream does not end with symbol', () => {
      const conn = new BinanceWsConnection();
      const { id, ws } = subscribeAndOpen(conn, { symbol: 'ETHUSDT', type: 'ticker' });

      ws.simulateMessage(
        JSON.stringify({
          stream: 'btcusdt@ticker',
          data: {
            e: '24hrTicker',
            s: 'BTCUSDT',
            c: '50000',
            b: '49999',
            a: '50001',
            h: '51000',
            l: '49000',
            v: '1000',
            q: '50000000',
          },
        })
      );

      expect(conn['subscriptions'].get(id)!.callback.onTicker).not.toHaveBeenCalled();
    });

    it('dispatches trade callback when event type matches', () => {
      const conn = new BinanceWsConnection();
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
});
