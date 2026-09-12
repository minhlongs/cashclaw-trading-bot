import { describe, it, expect, vi } from 'vitest';
import {
  validatePositiveFinite,
  normalizeBinanceTicker,
  normalizeOkxTicker,
  normalizeBybitTicker,
  normalizeTicker,
} from './ticker-normalizer';
import type { Binance24hrTicker, OkxTicker, BybitTicker } from './types';
import type { ExchangeId } from '../types';

describe('ticker-normalizer', () => {
  describe('validatePositiveFinite', () => {
    it('accepts positive numbers and numeric strings', () => {
      expect(validatePositiveFinite(123.45, 'price')).toBe(123.45);
      expect(validatePositiveFinite('678.9', 'price')).toBe(678.9);
      expect(validatePositiveFinite(0, 'volume')).toBe(0);
      expect(validatePositiveFinite('0', 'volume')).toBe(0);
    });

    it('throws on missing, null, empty, non-numeric, or negative numbers', () => {
      expect(() => validatePositiveFinite(undefined, 'f')).toThrow('Missing or empty value');
      expect(() => validatePositiveFinite(null, 'f')).toThrow('Missing or empty value');
      expect(() => validatePositiveFinite('', 'f')).toThrow('Missing or empty value');
      expect(() => validatePositiveFinite('abc', 'f')).toThrow('Invalid non-negative number');
      expect(() => validatePositiveFinite(NaN, 'f')).toThrow('Invalid non-negative number');
      expect(() => validatePositiveFinite(Infinity, 'f')).toThrow('Invalid non-negative number');
      expect(() => validatePositiveFinite(-1, 'f')).toThrow('Invalid non-negative number');
    });
  });

  describe('normalizeBinanceTicker', () => {
    const validBinance: Binance24hrTicker = {
      symbol: 'BTCUSDT', lastPrice: '50000.5', bidPrice: '49999.0', askPrice: '50001.0',
      highPrice: '51000.0', lowPrice: '49000.0', volume: '1234.56', quoteVolume: '61728000', closeTime: 1700000000000,
    };

    it('normalizes valid Binance ticker with closeTime and custom symbol', () => {
      const res = normalizeBinanceTicker(validBinance, 'BTC/USDT');
      expect(res).toEqual({
        symbol: 'BTC/USDT', last: 50000.5, bid: 49999.0, ask: 50001.0,
        high24h: 51000.0, low24h: 49000.0, volume24h: 1234.56, timestamp: 1700000000000,
      });
      const inferred = normalizeBinanceTicker(validBinance);
      expect(inferred.symbol).toBe('BTC/USDT');
    });

    it('falls back to Date.now() when closeTime is omitted', () => {
      const withoutTime = { ...validBinance };
      delete withoutTime.closeTime;
      vi.spyOn(Date, 'now').mockReturnValueOnce(1711111111111);
      expect(normalizeBinanceTicker(withoutTime).timestamp).toBe(1711111111111);
    });

    it('throws when raw is null or closeTime is invalid', () => {
      expect(() => normalizeBinanceTicker(null as unknown as Binance24hrTicker)).toThrow('non-null object');
      expect(() => normalizeBinanceTicker({ ...validBinance, closeTime: -5 })).toThrow('Invalid closeTime');
      expect(() => normalizeBinanceTicker({ ...validBinance, closeTime: NaN })).toThrow('Invalid closeTime');
      expect(() => normalizeBinanceTicker({ ...validBinance, closeTime: 'bad' as unknown as number })).toThrow('Invalid closeTime');
    });
  });

  describe('normalizeOkxTicker', () => {
    const validOkx: OkxTicker = {
      instId: 'BTC-USDT', last: '50000.5', bidPx: '49999.0', askPx: '50001.0',
      high24h: '51000.0', low24h: '49000.0', vol24h: '1234.56', volCcy24h: '61728000', ts: '1700000000000',
    };

    it('normalizes valid OKX ticker', () => {
      const res = normalizeOkxTicker(validOkx, 'BTC/USDT');
      expect(res).toEqual({
        symbol: 'BTC/USDT', last: 50000.5, bid: 49999.0, ask: 50001.0,
        high24h: 51000.0, low24h: 49000.0, volume24h: 1234.56, timestamp: 1700000000000,
      });
      expect(normalizeOkxTicker(validOkx).symbol).toBe('BTC/USDT');
    });

    it('throws when raw is null or timestamp is corrupt', () => {
      expect(() => normalizeOkxTicker(null as unknown as OkxTicker)).toThrow('non-null object');
      expect(() => normalizeOkxTicker({ ...validOkx, ts: 'invalid' })).toThrow('Invalid timestamp');
      expect(() => normalizeOkxTicker({ ...validOkx, ts: '-10' })).toThrow('Invalid timestamp');
    });
  });

  describe('normalizeBybitTicker', () => {
    const validBybit: BybitTicker = {
      symbol: 'BTCUSDT', lastPrice: '50000.5', bid1Price: '49999.0', ask1Price: '50001.0',
      highPrice24h: '51000.0', lowPrice24h: '49000.0', volume24h: '1234.56', turnover24h: '61728000',
    };

    it('normalizes valid Bybit ticker with supplied timestamp', () => {
      const res = normalizeBybitTicker(validBybit, 'BTC/USDT', 1700000000000);
      expect(res).toEqual({
        symbol: 'BTC/USDT', last: 50000.5, bid: 49999.0, ask: 50001.0,
        high24h: 51000.0, low24h: 49000.0, volume24h: 1234.56, timestamp: 1700000000000,
      });
      expect(normalizeBybitTicker(validBybit, undefined, 1700000000000).symbol).toBe('BTC/USDT');
    });

    it('falls back to Date.now() when timestamp is omitted', () => {
      vi.spyOn(Date, 'now').mockReturnValueOnce(1722222222222);
      expect(normalizeBybitTicker(validBybit).timestamp).toBe(1722222222222);
    });

    it('throws when raw is null or timestamp is invalid', () => {
      expect(() => normalizeBybitTicker(null as unknown as BybitTicker)).toThrow('non-null object');
      expect(() => normalizeBybitTicker(validBybit, undefined, -1)).toThrow('Invalid timestamp');
      expect(() => normalizeBybitTicker(validBybit, undefined, NaN)).toThrow('Invalid timestamp');
    });
  });

  describe('normalizeTicker', () => {
    it('dispatches to binance, okx, and bybit correctly', () => {
      const bRes = normalizeTicker('binance', {
        symbol: 'BTCUSDT', lastPrice: '100', bidPrice: '99', askPrice: '101',
        highPrice: '110', lowPrice: '90', volume: '10', closeTime: 123456,
      });
      expect(bRes.symbol).toBe('BTC/USDT');

      const oRes = normalizeTicker('okx', {
        instId: 'BTC-USDT', last: '100', bidPx: '99', askPx: '101',
        high24h: '110', low24h: '90', vol24h: '10', ts: '123456',
      });
      expect(oRes.symbol).toBe('BTC/USDT');

      const yRes = normalizeTicker('bybit', {
        symbol: 'BTCUSDT', lastPrice: '100', bid1Price: '99', ask1Price: '101',
        highPrice24h: '110', lowPrice24h: '90', volume24h: '10',
      });
      expect(yRes.symbol).toBe('BTC/USDT');
    });

    it('throws on unsupported exchange', () => {
      expect(() => normalizeTicker('kraken' as unknown as ExchangeId, {})).toThrow('Unsupported exchange ID');
    });
  });
});
