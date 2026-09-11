import { describe, expect, it } from 'vitest';
import {
  buildBinanceHeaders,
  buildBinanceSignedQuery,
  signHmacSha256Hex,
} from './webcrypto-signer';

describe('webcrypto-signer', () => {
  describe('signHmacSha256Hex RFC 4231 test vectors', () => {
    it('passes RFC 4231 Case 1 (20-byte key, "Hi There")', async () => {
      const key = new Uint8Array(20).fill(0x0b);
      const data = 'Hi There';
      const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
      const signature = await signHmacSha256Hex(key, data);
      expect(signature).toBe(expected);
    });

    it('passes RFC 4231 Case 2 (key="Jefe", "what do ya want for nothing?")', async () => {
      const key = 'Jefe';
      const data = 'what do ya want for nothing?';
      const expected = '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843';
      const signature = await signHmacSha256Hex(key, data);
      expect(signature).toBe(expected);
    });

    it('passes RFC 4231 Case 7 (131-byte key, data > blocksize, Uint8Array payload)', async () => {
      const key = new Uint8Array(131).fill(0xaa);
      const dataStr =
        'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.';
      const dataBytes = new TextEncoder().encode(dataStr);
      const expected = '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2';
      const signature = await signHmacSha256Hex(key, dataBytes);
      expect(signature).toBe(expected);
    });
  });

  describe('Binance official API doc vector', () => {
    it('signs official Binance query string with expected signature', async () => {
      const secret = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j'; // gitleaks:allow — published Binance API docs example vector
      const rawPayload =
        'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559';
      const expectedSig = 'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71';
      const signature = await signHmacSha256Hex(secret, rawPayload);
      expect(signature).toBe(expectedSig);
    });
  });

  describe('input validation & errors', () => {
    it('throws when secret is empty, whitespace, or empty Uint8Array', async () => {
      await expect(signHmacSha256Hex('', 'data')).rejects.toThrow('HMAC secret cannot be empty');
      await expect(signHmacSha256Hex('   ', 'data')).rejects.toThrow('HMAC secret cannot be empty');
      await expect(signHmacSha256Hex(new Uint8Array(0), 'data')).rejects.toThrow('HMAC secret cannot be empty');
      const badSecret = null as unknown as string;
      await expect(signHmacSha256Hex(badSecret, 'data')).rejects.toThrow('HMAC secret cannot be empty');
    });

    it('validates apiKey in buildBinanceHeaders', () => {
      expect(() => buildBinanceHeaders('')).toThrow('API key cannot be empty');
      expect(() => buildBinanceHeaders('  \t ')).toThrow('API key cannot be empty');
      const headers = buildBinanceHeaders('test-api-key');
      expect(headers).toEqual({
        'X-MBX-APIKEY': 'test-api-key',
        'Content-Type': 'application/json',
      });
    });

    it('throws if secret is empty in buildBinanceSignedQuery', async () => {
      await expect(buildBinanceSignedQuery({}, '')).rejects.toThrow('HMAC secret cannot be empty');
      await expect(buildBinanceSignedQuery({}, '  ')).rejects.toThrow('HMAC secret cannot be empty');
    });

    it('enforces recvWindow boundaries (> 0 and <= 60000)', async () => {
      const secret = 'valid-secret';
      await expect(buildBinanceSignedQuery({}, secret, { recvWindow: 0 })).rejects.toThrow(
        'recvWindow must be between 1 and 60000'
      );
      await expect(buildBinanceSignedQuery({}, secret, { recvWindow: -100 })).rejects.toThrow(
        'recvWindow must be between 1 and 60000'
      );
      await expect(buildBinanceSignedQuery({}, secret, { recvWindow: 60001 })).rejects.toThrow(
        'recvWindow must be between 1 and 60000'
      );
      await expect(buildBinanceSignedQuery({ recvWindow: 0 }, secret)).rejects.toThrow(
        'recvWindow must be between 1 and 60000'
      );
      await expect(buildBinanceSignedQuery({}, secret, { recvWindow: Number.NaN })).rejects.toThrow(
        'recvWindow must be between 1 and 60000'
      );
    });
  });

  describe('buildBinanceSignedQuery sorting and encoding', () => {
    const secret = 'test-secret';

    it('sorts parameters alphabetically and omits undefined values', async () => {
      const params = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 0.5,
        price: 50000,
        emptyVal: undefined,
      };

      const result = await buildBinanceSignedQuery(params, secret, {
        timestamp: 1700000000000,
        recvWindow: 5000,
      });

      expect(result.sortedQueryString).toBe(
        'price=50000&quantity=0.5&recvWindow=5000&side=BUY&symbol=BTCUSDT&timestamp=1700000000000'
      );
      expect(result.signature).toHaveLength(64);
      expect(result.fullQueryString).toBe(`${result.sortedQueryString}&signature=${result.signature}`);
    });

    it('URL encodes special characters in parameters', async () => {
      const params = { note: 'test & test = yes' };
      const result = await buildBinanceSignedQuery(params, secret, {
        timestamp: 1700000000000,
        recvWindow: 1000,
      });
      expect(result.sortedQueryString).toContain('note=test%20%26%20test%20%3D%20yes');
    });

    it('injects default timestamp and recvWindow when not provided in options', async () => {
      const before = Date.now();
      const result = await buildBinanceSignedQuery({ symbol: 'ETHUSDT' }, secret);
      const after = Date.now();

      expect(result.sortedQueryString).toContain('recvWindow=5000');
      const match = result.sortedQueryString.match(/timestamp=(\d+)/);
      expect(match).not.toBeNull();
      const ts = Number(match?.[1]);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('respects timestamp and recvWindow passed in params', async () => {
      const result = await buildBinanceSignedQuery(
        { symbol: 'SOLUSDT', timestamp: 1699999999000, recvWindow: 10000 },
        secret
      );
      expect(result.sortedQueryString).toContain('timestamp=1699999999000');
      expect(result.sortedQueryString).toContain('recvWindow=10000');
    });

    it('accepts boundary recvWindow values (1 and 60000)', async () => {
      const r1 = await buildBinanceSignedQuery({}, secret, { recvWindow: 1 });
      expect(r1.sortedQueryString).toContain('recvWindow=1');

      const r60k = await buildBinanceSignedQuery({}, secret, { recvWindow: 60000 });
      expect(r60k.sortedQueryString).toContain('recvWindow=60000');
    });
  });
});
