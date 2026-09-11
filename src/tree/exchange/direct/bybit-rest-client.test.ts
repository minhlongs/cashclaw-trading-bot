import { describe, expect, it, vi } from 'vitest';
import { BybitRestClient } from './bybit-rest-client';

describe('BybitRestClient', () => {
  describe('constructor & defaults', () => {
    it('throws when baseUrl has an invalid protocol', () => {
      expect(() => new BybitRestClient({ baseUrl: 'ftp://api.bybit.com' })).toThrow(
        'Invalid baseUrl protocol: must start with https:// or http://'
      );
    });

    it('throws when recvWindow is out of range', () => {
      expect(() => new BybitRestClient({ recvWindow: 0 })).toThrow('recvWindow must be between 1 and 60000');
      expect(() => new BybitRestClient({ recvWindow: 60001 })).toThrow('recvWindow must be between 1 and 60000');
    });

    it('strips trailing slashes from baseUrl', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { timeSecond: '1666879482' } }), { status: 200 })
      );
      const client = new BybitRestClient({ baseUrl: 'https://api.bybit.com///', fetchFn: mockFetch });
      await client.ping();
      expect(mockFetch).toHaveBeenCalledWith('https://api.bybit.com/v5/market/time', { method: 'GET' });
    });
  });

  describe('ping', () => {
    it('returns true when ping succeeds with retCode 0', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: {} }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      expect(await client.ping()).toBe(true);
    });
  });

  describe('getServerTime', () => {
    it('returns timestamp from numeric time field', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', time: 1666879482792, result: {} }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      expect(await client.getServerTime()).toBe(1666879482792);
    });

    it('returns timestamp from string time field', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', time: '1666879482792', result: {} }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      expect(await client.getServerTime()).toBe(1666879482792);
    });

    it('falls back to result.timeSecond * 1000', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { timeSecond: '1666879482' } }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      expect(await client.getServerTime()).toBe(1666879482000);
    });

    it('throws when serverTime fields are missing or invalid', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: {} }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      await expect(client.getServerTime()).rejects.toThrow('Invalid serverTime format in Bybit response');
    });
  });

  describe('fetchTicker', () => {
    const fakeTicker = {
      symbol: 'BTCUSDT',
      lastPrice: '65000.50',
      highPrice24h: '66000.00',
      lowPrice24h: '64000.00',
      volume24h: '1234.56',
      turnover24h: '80000000.00',
      bid1Price: '65000.00',
      ask1Price: '65001.00',
    };

    it('fetches ticker with default spot category', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { list: [fakeTicker] } }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      const ticker = await client.fetchTicker('btcusdt');
      expect(ticker.symbol).toBe('BTCUSDT');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT',
        { method: 'GET' }
      );
    });

    it('fetches ticker with (symbol, category)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { list: [fakeTicker] } }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      const ticker = await client.fetchTicker('BTCUSDT', 'linear');
      expect(ticker.symbol).toBe('BTCUSDT');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
        { method: 'GET' }
      );
    });

    it('fetches ticker with (category, symbol) per Escrow 1', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { list: [fakeTicker] } }), { status: 200 })
      );
      const client = new BybitRestClient({ fetchFn: mockFetch });
      await client.fetchTicker('inverse', 'BTCUSD');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bybit.com/v5/market/tickers?category=inverse&symbol=BTCUSD',
        { method: 'GET' }
      );
    });

    it('throws when symbol is empty or whitespace', async () => {
      const client = new BybitRestClient();
      await expect(client.fetchTicker('')).rejects.toThrow('Symbol cannot be empty');
      await expect(client.fetchTicker('   ')).rejects.toThrow('Symbol cannot be empty');
      await expect(client.fetchTicker('spot', '')).rejects.toThrow('Symbol cannot be empty');
      await expect(client.fetchTicker('spot', undefined as unknown as string)).rejects.toThrow('Symbol cannot be empty');
    });
  });

  describe('createSignedRequest', () => {
    it('creates a valid GET SignedRequest with sorted parameters', async () => {
      const client = new BybitRestClient({
        apiKey: 'bybit-api-key',
        apiSecret: 'bybit-api-secret',
        recvWindow: 4000,
      });

      const signedReq = await client.createSignedRequest(
        'v5/order/realtime',
        'GET',
        { symbol: 'BTCUSDT', category: 'spot', test: undefined }
      );

      expect(signedReq.method).toBe('GET');
      expect(signedReq.headers['X-BAPI-API-KEY']).toBe('bybit-api-key');
      expect(signedReq.headers['X-BAPI-RECV-WINDOW']).toBe('4000');
      expect(signedReq.queryString).toBe('category=spot&symbol=BTCUSDT');
      expect(signedReq.url).toBe('https://api.bybit.com/v5/order/realtime?category=spot&symbol=BTCUSDT');
      expect(signedReq.signature.length).toBe(64);
    });

    it('creates a valid POST SignedRequest with JSON body', async () => {
      const client = new BybitRestClient({ apiKey: 'bybit-api-key', apiSecret: 'bybit-api-secret' });
      const signedReq = await client.createSignedRequest('/v5/order/create', 'POST', {}, { category: 'spot', symbol: 'BTCUSDT' });
      expect(signedReq.method).toBe('POST');
      expect(signedReq.queryString).toBe('');
      expect(signedReq.url).toBe('https://api.bybit.com/v5/order/create');
    });

    it('handles GET without params and POST without body', async () => {
      const client = new BybitRestClient({ apiKey: 'k', apiSecret: 's' });
      const getReq = await client.createSignedRequest('v5/account/wallet-balance', 'GET');
      expect(getReq.queryString).toBe('');
      expect(getReq.url).toBe('https://api.bybit.com/v5/account/wallet-balance');

      const postReq = await client.createSignedRequest('v5/account/set-margin-mode', 'POST');
      expect(postReq.queryString).toBe('');
    });

    it('throws when credentials are missing or empty', async () => {
      const noKey = new BybitRestClient({ apiSecret: 's' });
      await expect(noKey.createSignedRequest('test')).rejects.toThrow('API key cannot be empty');

      const noSecret = new BybitRestClient({ apiKey: 'k' });
      await expect(noSecret.createSignedRequest('test')).rejects.toThrow('HMAC secret cannot be empty');
    });
  });
});
