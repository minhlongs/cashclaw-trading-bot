import { describe, it, expect } from 'vitest';
import {
  parseSymbol,
  toCanonicalSymbol,
  toExchangeSymbol,
  COMMON_QUOTES,
} from './symbol-normalizer';
import type { ExchangeId } from '../types';

describe('symbol-normalizer', () => {
  describe('parseSymbol', () => {
    it('parses standard slash-delimited pairs with whitespace and casing', () => {
      expect(parseSymbol('btc/usdt')).toEqual({ base: 'BTC', quote: 'USDT' });
      expect(parseSymbol(' ETH/USDC ')).toEqual({ base: 'ETH', quote: 'USDC' });
      expect(parseSymbol('sol/eur')).toEqual({ base: 'SOL', quote: 'EUR' });
    });

    it('parses hyphen-delimited pairs', () => {
      expect(parseSymbol('BTC-USDT')).toEqual({ base: 'BTC', quote: 'USDT' });
      expect(parseSymbol('eth-btc')).toEqual({ base: 'ETH', quote: 'BTC' });
    });

    it('parses underscore-delimited pairs', () => {
      expect(parseSymbol('DOGE_USDT')).toEqual({ base: 'DOGE', quote: 'USDT' });
      expect(parseSymbol('bnb_dai')).toEqual({ base: 'BNB', quote: 'DAI' });
    });

    it('parses undivided symbols for all common quote currencies', () => {
      for (const quote of COMMON_QUOTES) {
        expect(parseSymbol(`ADA${quote}`)).toEqual({ base: 'ADA', quote });
      }
    });

    it('prefers longer matching quote in undivided string', () => {
      // USDT should match before USD
      expect(parseSymbol('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
      expect(parseSymbol('BTCUSD')).toEqual({ base: 'BTC', quote: 'USD' });
    });

    it('throws on empty or whitespace strings', () => {
      expect(() => parseSymbol('')).toThrow('Symbol cannot be empty');
      expect(() => parseSymbol('   ')).toThrow('Symbol cannot be empty');
      expect(() => parseSymbol(null as unknown as string)).toThrow('Symbol cannot be empty');
    });

    it('throws on mixed delimiters', () => {
      expect(() => parseSymbol('BTC/USDT-PERP')).toThrow('Malformed symbol with mixed delimiters');
    });

    it('throws on malformed delimiter structures', () => {
      expect(() => parseSymbol('BTC/USDT/EXTRA')).toThrow('Malformed symbol structure');
      expect(() => parseSymbol('/USDT')).toThrow('Malformed symbol structure');
      expect(() => parseSymbol('BTC/')).toThrow('Malformed symbol structure');
      expect(() => parseSymbol('-USDT')).toThrow('Malformed symbol structure');
    });

    it('throws on unparseable undivided symbols', () => {
      expect(() => parseSymbol('UNKNOWNPAIR')).toThrow('Unable to parse undivided symbol');
      expect(() => parseSymbol('USDT')).toThrow('Unable to parse undivided symbol');
    });
  });

  describe('toCanonicalSymbol', () => {
    it('normalizes various formats to canonical BASE/QUOTE', () => {
      expect(toCanonicalSymbol('btcusdt')).toBe('BTC/USDT');
      expect(toCanonicalSymbol('ETH-USDC')).toBe('ETH/USDC');
      expect(toCanonicalSymbol('SOL_USDT')).toBe('SOL/USDT');
      expect(toCanonicalSymbol('btc/usdt')).toBe('BTC/USDT');
    });
  });

  describe('toExchangeSymbol', () => {
    it('formats for Binance (undivided uppercase)', () => {
      expect(toExchangeSymbol('BTC/USDT', 'binance')).toBe('BTCUSDT');
      expect(toExchangeSymbol('eth-usdt', 'binance')).toBe('ETHUSDT');
    });

    it('formats for OKX (hyphenated uppercase)', () => {
      expect(toExchangeSymbol('BTC/USDT', 'okx')).toBe('BTC-USDT');
      expect(toExchangeSymbol('ethusdt', 'okx')).toBe('ETH-USDT');
    });

    it('formats for Bybit (undivided uppercase)', () => {
      expect(toExchangeSymbol('BTC/USDT', 'bybit')).toBe('BTCUSDT');
      expect(toExchangeSymbol('sol_usdc', 'bybit')).toBe('SOLUSDC');
    });

    it('throws on unsupported exchange ID', () => {
      expect(() => toExchangeSymbol('BTC/USDT', 'coinbase' as unknown as ExchangeId)).toThrow(
        'Unsupported exchange ID: coinbase'
      );
    });
  });
});
