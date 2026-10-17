import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchFundingRate,
  fetchOpenInterestHistory,
  fetchLiquidations,
  fetchPremiumIndex,
} from '../funding';

const originalFetch = global.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  global.fetch = originalFetch;
  mockFetch.mockReset();
});

describe('funding.ts — derivative data fetching', () => {
  describe('fetchFundingRate', () => {
    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      await expect(fetchFundingRate('BTC/USDT')).rejects.toThrow();
    });

    it('parses valid binance funding rate response', async () => {
      const mockData = [
        { timestamp: 1700000000000, fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 1700028800000, fundingRate: -0.00005, markPrice: 50100 },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchFundingRate('BTC/USDT', undefined, undefined, 10);
      expect(result).toHaveLength(2);
      expect(result[0].fundingRate).toBe(0.0001);
      expect(result[1].fundingRate).toBe(-0.00005);
    });

    it('handles non-array response gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: -1003, msg: 'Too many requests' }),
      });
      const result = await fetchFundingRate('BTC/USDT');
      expect(result).toEqual([]);
    });

    it('uses correct query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await fetchFundingRate('ETH/USDT', 1690000000000, 1700000000000, 50);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('symbol=ETHUSDT');
      expect(url).toContain('limit=50');
      expect(url).toContain('startTime=1690000000000');
      expect(url).toContain('endTime=1700000000000');
    });
  });

  describe('fetchOpenInterestHistory', () => {
    it('throws error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));
      await expect(fetchOpenInterestHistory('BTC/USDT', '1h')).rejects.toThrow();
    });

    it('parses valid OI history response', async () => {
      const mockData = [
        {
          timestamp: 1700000000000,
          openInterest: 50000.123,
          price: 50000,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchOpenInterestHistory('BTC/USDT', '1h', undefined, undefined, 10);
      expect(result).toHaveLength(1);
      expect(result[0].openInterest).toBe(50000.123);
      expect(result[0].notionalUsd).toBe(50000.123 * 50000);
    });
  });

  describe('fetchLiquidations', () => {
    it('throws error on 503', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });
      await expect(fetchLiquidations('BTC/USDT')).rejects.toThrow();
    });

    it('parses liquidation orders correctly', async () => {
      const mockData = [
        {
          time: 1700000000000,
          side: 'BUY',
          price: 50000,
          qty: 2.5,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchLiquidations('BTC/USDT');
      expect(result).toHaveLength(1);
      expect(result[0].side).toBe('short');
      expect(result[0].quantity).toBe(2.5);
      expect(result[0].price).toBe(50000);
    });
  });

  describe('fetchPremiumIndex', () => {
    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('err'));
      await expect(fetchPremiumIndex('BTC/USDT')).rejects.toThrow();
    });

    it('parses mark and index price correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            time: 1700000000000,
            markPrice: 50100,
            indexPrice: 50000,
          },
        ],
      });

      const result = await fetchPremiumIndex('BTC/USDT');
      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(1700000000000);
      expect(result[0].basis).toBeCloseTo((50100 - 50000) / 50000, 6);
    });
  });
});
