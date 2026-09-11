import { describe, expect, it } from 'vitest';
import {
  buildBybitHeaders,
  buildBybitSignature,
  buildOkxHeaders,
  buildOkxSignature,
  signHmacSha256Hex,
} from './webcrypto-signer';

describe('webcrypto-signer OKX & Bybit', () => {
  describe('OKX signature & headers', () => {
    it('builds valid OKX headers without simulated trading', () => {
      const headers = buildOkxHeaders('api-key', 'passphrase', '2023-10-25T14:30:15.123Z', 'sig-base64');
      expect(headers['OK-ACCESS-KEY']).toBe('api-key');
      expect(headers['OK-ACCESS-PASSPHRASE']).toBe('passphrase');
      expect(headers['OK-ACCESS-TIMESTAMP']).toBe('2023-10-25T14:30:15.123Z');
      expect(headers['OK-ACCESS-SIGN']).toBe('sig-base64');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['x-simulated-trading']).toBeUndefined();
    });

    it('adds x-simulated-trading when simulated is true', () => {
      const headers = buildOkxHeaders('k', 'p', 't', 's', true);
      expect(headers['x-simulated-trading']).toBe('1');
    });

    it('throws when required header fields are empty', () => {
      expect(() => buildOkxHeaders('', 'p', 't', 's')).toThrow('API key cannot be empty');
      expect(() => buildOkxHeaders('k', '', 't', 's')).toThrow('Passphrase cannot be empty');
      expect(() => buildOkxHeaders('k', 'p', '', 's')).toThrow('Timestamp cannot be empty');
      expect(() => buildOkxHeaders('k', 'p', 't', '')).toThrow('Signature cannot be empty');
    });

    it('computes OKX signature with and without body', async () => {
      const secret = 'secret-key';
      const sigWithoutBody = await buildOkxSignature(
        secret,
        '2023-10-25T14:30:15.123Z',
        'get',
        '/api/v5/market/ticker?instId=BTC-USDT'
      );
      expect(typeof sigWithoutBody).toBe('string');
      expect(sigWithoutBody.length).toBeGreaterThan(0);

      const sigWithBody = await buildOkxSignature(
        secret,
        '2023-10-25T14:30:15.123Z',
        'POST',
        '/api/v5/trade/order',
        '{"instId":"BTC-USDT"}'
      );
      expect(typeof sigWithBody).toBe('string');
      expect(sigWithBody).not.toBe(sigWithoutBody);
    });

    it('throws when OKX signature params are empty', async () => {
      await expect(buildOkxSignature('sec', '', 'GET', '/path')).rejects.toThrow('Timestamp cannot be empty');
      await expect(buildOkxSignature('sec', 'ts', '', '/path')).rejects.toThrow('HTTP method cannot be empty');
      await expect(buildOkxSignature('sec', 'ts', 'GET', '')).rejects.toThrow('Request path cannot be empty');
      await expect(buildOkxSignature('', 'ts', 'GET', '/path')).rejects.toThrow('HMAC secret cannot be empty');
    });
  });

  describe('Bybit signature & headers', () => {
    it('builds valid Bybit headers with default and custom recvWindow', () => {
      const h1 = buildBybitHeaders('bybit-key', 1672531199000, 'sig-hex');
      expect(h1['X-BAPI-API-KEY']).toBe('bybit-key');
      expect(h1['X-BAPI-TIMESTAMP']).toBe('1672531199000');
      expect(h1['X-BAPI-RECV-WINDOW']).toBe('5000');
      expect(h1['X-BAPI-SIGN']).toBe('sig-hex');
      expect(h1['Content-Type']).toBe('application/json');

      const h2 = buildBybitHeaders('bybit-key', '1672531199000', 'sig-hex', 10000);
      expect(h2['X-BAPI-RECV-WINDOW']).toBe('10000');
    });

    it('throws when required Bybit header params are empty or invalid', () => {
      expect(() => buildBybitHeaders('', '123', 'sig')).toThrow('API key cannot be empty');
      expect(() => buildBybitHeaders('k', '', 'sig')).toThrow('Timestamp cannot be empty');
      expect(() => buildBybitHeaders('k', '123', '')).toThrow('Signature cannot be empty');
      expect(() => buildBybitHeaders('k', '123', 'sig', 0)).toThrow('recvWindow must be between 1 and 60000');
      expect(() => buildBybitHeaders('k', '123', 'sig', 60001)).toThrow('recvWindow must be between 1 and 60000');
    });

    it('computes Bybit signature matching preHash formula', async () => {
      const secret = 'bybit-secret';
      const sig = await buildBybitSignature(secret, '1672531199000', 'my-api-key', 5000, 'category=spot&symbol=BTCUSDT');
      const expected = await signHmacSha256Hex(secret, '1672531199000my-api-key5000category=spot&symbol=BTCUSDT');
      expect(sig).toBe(expected);

      const sigNoPayload = await buildBybitSignature(secret, 1672531199000, 'my-api-key', '5000');
      const expectedNoPayload = await signHmacSha256Hex(secret, '1672531199000my-api-key5000'); // gitleaks:allow
      expect(sigNoPayload).toBe(expectedNoPayload);
    });

    it('throws when Bybit signature params are empty or invalid', async () => {
      await expect(buildBybitSignature('sec', '123', '', 5000)).rejects.toThrow('API key cannot be empty');
      await expect(buildBybitSignature('sec', '', 'key', 5000)).rejects.toThrow('Timestamp cannot be empty');
      await expect(buildBybitSignature('sec', '123', 'key', 0)).rejects.toThrow('recvWindow must be between 1 and 60000');
      await expect(buildBybitSignature('', '123', 'key', 5000)).rejects.toThrow('HMAC secret cannot be empty');
    });
  });
});
