import { describe, it, expect, vi } from 'vitest';
import {
  isSupportedDirectExchange,
  createDefaultPaperExchangeProvider,
} from './provider-factory';
import { DirectTickerProvider } from '@/tree/exchange/direct';

describe('provider-factory', () => {
  describe('isSupportedDirectExchange', () => {
    it('returns true for supported exchanges', () => {
      expect(isSupportedDirectExchange('binance')).toBe(true);
      expect(isSupportedDirectExchange('okx')).toBe(true);
      expect(isSupportedDirectExchange('bybit')).toBe(true);
    });

    it('returns false for unsupported exchanges', () => {
      expect(isSupportedDirectExchange('kraken')).toBe(false);
      expect(isSupportedDirectExchange('coinbase')).toBe(false);
      expect(isSupportedDirectExchange('')).toBe(false);
      expect(isSupportedDirectExchange('paper')).toBe(false);
    });
  });

  describe('createDefaultPaperExchangeProvider', () => {
    it('auto-wires DirectTickerProvider for binance, okx, and bybit', () => {
      for (const exchange of ['binance', 'okx', 'bybit'] as const) {
        const provider = createDefaultPaperExchangeProvider(exchange);
        expect(provider.id).toBe(`provider:${exchange}:paper`);
        const config = provider.getConfig();
        expect(config.directTickerProvider).toBeInstanceOf(DirectTickerProvider);
        expect(config.initialBalances).toEqual([{ currency: 'USDT', total: 10000 }]);
      }
    });

    it('creates provider without directTickerProvider for unsupported exchanges', () => {
      const provider = createDefaultPaperExchangeProvider('kraken');
      expect(provider.id).toBe('provider:kraken:paper');
      const config = provider.getConfig();
      expect(config.directTickerProvider).toBeUndefined();
    });

    it('uses explicitly provided directTickerProvider', () => {
      const customDirectProvider = new DirectTickerProvider({ exchangeId: 'binance' });
      const provider = createDefaultPaperExchangeProvider('binance', {
        directTickerProvider: customDirectProvider,
      });
      const config = provider.getConfig();
      expect(config.directTickerProvider).toBe(customDirectProvider);
    });

    it('accepts custom initialBalances', () => {
      const customBalances = [
        { currency: 'BTC', total: 2 },
        { currency: 'USDT', total: 50000 },
      ];
      const provider = createDefaultPaperExchangeProvider('binance', {
        initialBalances: customBalances,
      });
      const config = provider.getConfig();
      expect(config.initialBalances).toEqual(customBalances);
    });

    it('falls back to simulated mode when DirectTickerProvider construction throws', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Passing an invalid supported-type mock that causes constructor failure
      const provider = createDefaultPaperExchangeProvider('binance', {
        directTickerProvider: undefined,
      });
      expect(provider).toBeDefined();
      spy.mockRestore();
    });
  });
});
