import { describe, expect, it, vi } from 'vitest';
import { BinanceRestClient } from './binance-rest-client';

describe('BinanceRestClient', () => {
  describe('constructor & defaults', () => {
    it('throws when baseUrl has an invalid protocol', () => {
      expect(() => new BinanceRestClient({ baseUrl: 'ftp://api.binance.com' })).toThrow(
        'Invalid baseUrl protocol: must start with https:// or http://'
      );
    });

    it('strips trailing slashes from baseUrl', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const client = new BinanceRestClient({
        baseUrl: 'https://testnet.binance.vision///',
        fetchFn: mockFetch,
      });
      await client.ping();
      expect(mockFetch).toHaveBeenCalledWith('https://testnet.binance.vision/api/v3/ping', {
        method: 'GET',
      });
    });
  });

  describe('ping', () => {
    it('returns true when ping succeeds with 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const client = new BinanceRestClient({ fetchFn: mockFetch });
      const result = await client.ping();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://api.binance.com/api/v3/ping', {
        method: 'GET',
      });
    });
  });

  describe('getServerTime', () => {
    it('returns serverTime number on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ serverTime: 1700000000123 }), { status: 200 })
      );
      const client = new BinanceRestClient({ fetchFn: mockFetch });
      const time = await client.getServerTime();
      expect(time).toBe(1700000000123);
      expect(mockFetch).toHaveBeenCalledWith('https://api.binance.com/api/v3/time', {
        method: 'GET',
      });
    });

    it('throws when serverTime is invalid or missing in response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ serverTime: 'invalid-time' }), { status: 200 })
      );
      const client = new BinanceRestClient({ fetchFn: mockFetch });
      await expect(client.getServerTime()).rejects.toThrow(
        'Invalid serverTime format in Binance response'
      );
    });

    it('throws when serverTime is NaN or not finite', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      const client = new BinanceRestClient({ fetchFn: mockFetch });
      await expect(client.getServerTime()).rejects.toThrow(
        'Invalid serverTime format in Binance response'
      );
    });
  });

  describe('fetchTicker', () => {
    it('fetches 24hr ticker for a valid symbol', async () => {
      const fakeTicker = {
        symbol: 'BTCUSDT',
        lastPrice: '65000.50',
        bidPrice: '65000.00',
        askPrice: '65001.00',
        highPrice: '66000.00',
        lowPrice: '64000.00',
        volume: '1234.56',
        quoteVolume: '80000000.00',
      };
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(fakeTicker), { status: 200 })
      );
      const client = new BinanceRestClient({ fetchFn: mockFetch });
      const ticker = await client.fetchTicker('btcusdt');
      expect(ticker.symbol).toBe('BTCUSDT');
      expect(ticker.lastPrice).toBe('65000.50');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
        { method: 'GET' }
      );
    });

    it('throws when symbol is empty or whitespace', async () => {
      const client = new BinanceRestClient();
      await expect(client.fetchTicker('')).rejects.toThrow('Symbol cannot be empty');
      await expect(client.fetchTicker('   ')).rejects.toThrow('Symbol cannot be empty');
    });
  });

  describe('createSignedRequest', () => {
    it('creates a valid SignedRequest structure without executing an order', async () => {
      const client = new BinanceRestClient({
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        recvWindow: 4000,
      });

      const signedReq = await client.createSignedRequest(
        'api/v3/account',
        { omitZeroBalances: true },
        'GET'
      );

      expect(signedReq.method).toBe('GET');
      expect(signedReq.headers['X-MBX-APIKEY']).toBe('test-api-key');
      expect(signedReq.headers['Content-Type']).toBe('application/json');
      expect(signedReq.queryString).toContain('omitZeroBalances=true');
      expect(signedReq.queryString).toContain('recvWindow=4000');
      expect(signedReq.queryString).toContain('&signature=');
      expect(signedReq.url).toBe(`https://api.binance.com/api/v3/account?${signedReq.queryString}`);
      expect(signedReq.signature).toHaveLength(64);
    });

    it('handles endpoint starting with a slash and POST method', async () => {
      const client = new BinanceRestClient({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const signedReq = await client.createSignedRequest(
        '/api/v3/order/test',
        { symbol: 'ETHUSDT', side: 'BUY' },
        'POST'
      );

      expect(signedReq.method).toBe('POST');
      expect(signedReq.url).toContain('https://api.binance.com/api/v3/order/test?');
      expect(signedReq.queryString).toContain('side=BUY&symbol=ETHUSDT');
    });

    it('throws if apiKey or apiSecret is missing or whitespace', async () => {
      const noKeyClient = new BinanceRestClient({ apiSecret: 'secret' });
      await expect(noKeyClient.createSignedRequest('/test')).rejects.toThrow(
        'API key cannot be empty'
      );

      const whitespaceKeyClient = new BinanceRestClient({
        apiKey: '   ',
        apiSecret: 'secret',
      });
      await expect(whitespaceKeyClient.createSignedRequest('/test')).rejects.toThrow(
        'API key cannot be empty'
      );

      const noSecretClient = new BinanceRestClient({ apiKey: 'key' });
      await expect(noSecretClient.createSignedRequest('/test')).rejects.toThrow(
        'HMAC secret cannot be empty'
      );

      const whitespaceSecretClient = new BinanceRestClient({
        apiKey: 'key',
        apiSecret: '   ',
      });
      await expect(whitespaceSecretClient.createSignedRequest('/test')).rejects.toThrow(
        'HMAC secret cannot be empty'
      );
    });
  });
});
