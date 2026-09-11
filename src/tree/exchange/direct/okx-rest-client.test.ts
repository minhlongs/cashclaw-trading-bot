import { describe, expect, it, vi } from 'vitest';
import { OkxRestClient } from './okx-rest-client';

describe('OkxRestClient', () => {
  describe('constructor & defaults', () => {
    it('throws when baseUrl has an invalid protocol', () => {
      expect(() => new OkxRestClient({ baseUrl: 'ftp://api.okx.com' })).toThrow(
        'Invalid baseUrl protocol: must start with https:// or http://'
      );
    });

    it('strips trailing slashes from baseUrl', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: '0', msg: '', data: [] }), { status: 200 })
      );
      const client = new OkxRestClient({
        baseUrl: 'https://www.okx.com///',
        fetchFn: mockFetch,
      });
      await client.ping();
      expect(mockFetch).toHaveBeenCalledWith('https://www.okx.com/api/v5/system/status', {
        method: 'GET',
      });
    });
  });

  describe('ping', () => {
    it('returns true when ping succeeds with code 0', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: '0', msg: '', data: [{ state: 'ongoing' }] }), { status: 200 })
      );
      const client = new OkxRestClient({ fetchFn: mockFetch });
      const res = await client.ping();
      expect(res).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://www.okx.com/api/v5/system/status', {
        method: 'GET',
      });
    });
  });

  describe('getServerTime', () => {
    it('returns parsed integer timestamp from ts field', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: '0', msg: '', data: [{ ts: '1597026383085' }] }), { status: 200 })
      );
      const client = new OkxRestClient({ fetchFn: mockFetch });
      const time = await client.getServerTime();
      expect(time).toBe(1597026383085);
      expect(mockFetch).toHaveBeenCalledWith('https://www.okx.com/api/v5/public/time', {
        method: 'GET',
      });
    });

    it('throws when ts is missing or invalid', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: '0', msg: '', data: [{ ts: 'invalid' }] }), { status: 200 })
      );
      const client = new OkxRestClient({ fetchFn: mockFetch });
      await expect(client.getServerTime()).rejects.toThrow('Invalid serverTime format in OKX response');
    });
  });

  describe('fetchTicker', () => {
    it('fetches 24hr ticker for a valid instrument ID', async () => {
      const fakeTicker = {
        instId: 'BTC-USDT',
        last: '65000.5',
        askPx: '65001.0',
        bidPx: '65000.0',
        high24h: '66000.0',
        low24h: '64000.0',
        vol24h: '1234.56',
        volCcy24h: '80000000.0',
        ts: '1597026383085',
      };
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: '0', msg: '', data: [fakeTicker] }), { status: 200 })
      );
      const client = new OkxRestClient({ fetchFn: mockFetch });
      const ticker = await client.fetchTicker('btc-usdt');
      expect(ticker.instId).toBe('BTC-USDT');
      expect(ticker.last).toBe('65000.5');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
        { method: 'GET' }
      );
    });

    it('throws when instId is empty or whitespace', async () => {
      const client = new OkxRestClient();
      await expect(client.fetchTicker('')).rejects.toThrow('Instrument ID cannot be empty');
      await expect(client.fetchTicker('   ')).rejects.toThrow('Instrument ID cannot be empty');
    });
  });

  describe('createSignedRequest', () => {
    it('creates a valid SignedRequest with GET and sorted query parameters', async () => {
      const client = new OkxRestClient({
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        passphrase: 'test-passphrase',
        simulated: true,
      });

      const signedReq = await client.createSignedRequest(
        'api/v5/account/balance',
        'GET',
        { ccy: 'BTC', b: 2, a: 1 }
      );

      expect(signedReq.method).toBe('GET');
      expect(signedReq.headers['OK-ACCESS-KEY']).toBe('test-api-key');
      expect(signedReq.headers['OK-ACCESS-PASSPHRASE']).toBe('test-passphrase');
      expect(signedReq.headers['x-simulated-trading']).toBe('1');
      expect(signedReq.queryString).toBe('a=1&b=2&ccy=BTC');
      expect(signedReq.url).toBe('https://www.okx.com/api/v5/account/balance?a=1&b=2&ccy=BTC');
      expect(typeof signedReq.signature).toBe('string');
      expect(signedReq.signature.length).toBeGreaterThan(0);
    });

    it('creates a valid SignedRequest with POST and JSON body', async () => {
      const client = new OkxRestClient({
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        passphrase: 'test-passphrase',
      });

      const signedReq = await client.createSignedRequest(
        '/api/v5/trade/order-algo',
        'POST',
        {},
        { instId: 'BTC-USDT', tdMode: 'cross' }
      );

      expect(signedReq.method).toBe('POST');
      expect(signedReq.queryString).toBe('');
      expect(signedReq.url).toBe('https://www.okx.com/api/v5/trade/order-algo');
      expect(signedReq.headers['x-simulated-trading']).toBeUndefined();
    });

    it('handles GET without params and POST without body', async () => {
      const client = new OkxRestClient({
        apiKey: 'k',
        apiSecret: 's',
        passphrase: 'p',
      });

      const getReq = await client.createSignedRequest('api/v5/account/config', 'GET');
      expect(getReq.queryString).toBe('');
      expect(getReq.url).toBe('https://www.okx.com/api/v5/account/config');

      const postReq = await client.createSignedRequest('api/v5/account/set-leverage', 'POST');
      expect(postReq.queryString).toBe('');
    });

    it('throws when credentials are missing or empty', async () => {
      const noKey = new OkxRestClient({ apiSecret: 's', passphrase: 'p' });
      await expect(noKey.createSignedRequest('test')).rejects.toThrow('API key cannot be empty');

      const noSecret = new OkxRestClient({ apiKey: 'k', passphrase: 'p' });
      await expect(noSecret.createSignedRequest('test')).rejects.toThrow('HMAC secret cannot be empty');

      const noPass = new OkxRestClient({ apiKey: 'k', apiSecret: 's' });
      await expect(noPass.createSignedRequest('test')).rejects.toThrow('Passphrase cannot be empty');
    });
  });
});
