import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Candle } from '@/forest/backtest/ohlcv';
import {
  fetchFundingRate,
  fetchOpenInterestHistory,
  fetchLiquidations,
  fetchPremiumIndex,
  computeDerivativeFeatures,
  rollingMean,
  rollingStd,
  fundingFields,
  oiFields,
  liquidationFields,
  basisFields,
  type FundingRatePoint,
  type OpenInterestPoint,
  type LiquidationPoint,
  type DerivativeFeatures,
} from './funding';

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

  afterEach(() => {
    mockFetch.mockReset();
  });

  describe('fetchFundingRate', () => {
    it('fetches and parses funding rate data', async () => {
      const mockData = [
        { timestamp: 1000, fundingRate: '0.0001', markPrice: '50000' },
        { timestamp: 2000, fundingRate: '0.0002', markPrice: '51000' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchFundingRate('BTCUSDT');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: 1000,
        symbol: 'BTCUSDT',
        fundingRate: 0.0001,
        markPrice: 50000,
      });
      expect(result[1]).toEqual({
        timestamp: 2000,
        symbol: 'BTCUSDT',
        fundingRate: 0.0002,
        markPrice: 51000,
      });
    });

    it('returns empty array on non-array response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 'invalid' }),
      });

      const result = await fetchFundingRate('BTCUSDT');
      expect(result).toEqual([]);
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      await expect(fetchFundingRate('BTCUSDT')).rejects.toThrow('[429]');
    });

    it('handles symbol with slash', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ timestamp: 1000, fundingRate: '0.0001', markPrice: '50000' }]),
      });

      await fetchFundingRate('BTC/USDT');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('symbol=BTCUSDT'),
        expect.anything()
      );
    });

    it('passes startTime, endTime, limit params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchFundingRate('BTCUSDT', 1000, 2000, 500);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('startTime=1000');
      expect(url).toContain('endTime=2000');
      expect(url).toContain('limit=500');
    });
  });

  describe('fetchOpenInterestHistory', () => {
    it('fetches and parses open interest with notionalUsd', async () => {
      const mockData = [
        { timestamp: 1000, openInterest: '1000', price: 50000 },
        { timestamp: 2000, openInterest: '2000', price: 51000 },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchOpenInterestHistory('BTCUSDT', '1h');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: 1000,
        symbol: 'BTCUSDT',
        openInterest: 1000,
        notionalUsd: 50000000,
      });
    });

    it('sets notionalUsd to null when price missing', async () => {
      const mockData = [{ timestamp: 1000, openInterest: '1000' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchOpenInterestHistory('BTCUSDT', '1h');
      expect(result[0].notionalUsd).toBeNull();
    });

    it('returns empty array on non-array response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await fetchOpenInterestHistory('BTCUSDT', '1h');
      expect(result).toEqual([]);
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchOpenInterestHistory('BTCUSDT', '1h')).rejects.toThrow('[500]');
    });

    it('passes period parameter correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchOpenInterestHistory('BTCUSDT', '4h', 1000, 2000, 10);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('period=4h');
      expect(url).toContain('limit=10');
    });
  });

  describe('fetchLiquidations', () => {
    it('fetches and parses liquidation data with side mapping', async () => {
      const mockData = [
        { time: 1000, side: 'SELL', price: '50000', qty: '1' }, // SELL = long liquidation
        { time: 2000, side: 'BUY', price: '51000', qty: '2' },   // BUY = short liquidation
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchLiquidations('BTCUSDT');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: 1000,
        symbol: 'BTCUSDT',
        side: 'long',
        price: 50000,
        quantity: 1,
        notionalUsd: 50000,
      });
      expect(result[1]).toEqual({
        timestamp: 2000,
        symbol: 'BTCUSDT',
        side: 'short',
        price: 51000,
        quantity: 2,
        notionalUsd: 102000,
      });
    });

    it('handles case-insensitive side values', async () => {
      const mockData = [
        { time: 1000, side: 'sell', price: '50000', qty: '1' },
        { time: 2000, side: 'Buy', price: '51000', qty: '2' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchLiquidations('BTCUSDT');
      expect(result[0].side).toBe('long');
      expect(result[1].side).toBe('short');
    });

    it('returns empty array on non-array response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await fetchLiquidations('BTCUSDT');
      expect(result).toEqual([]);
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(fetchLiquidations('BTCUSDT')).rejects.toThrow('[404]');
    });
  });

  describe('fetchPremiumIndex', () => {
    it('fetches and computes basis', async () => {
      const mockData = [
        { time: 1000, markPrice: '50100', indexPrice: '50000' }, // basis = 0.002
        { time: 2000, markPrice: '49900', indexPrice: '50000' }, // basis = -0.002
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchPremiumIndex('BTCUSDT');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ timestamp: 1000, basis: 0.002 });
      expect(result[1]).toEqual({ timestamp: 2000, basis: -0.002 });
    });

    it('returns empty array on non-array response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await fetchPremiumIndex('BTCUSDT');
      expect(result).toEqual([]);
    });
  });
});

describe('funding.ts — rolling statistics', () => {
  describe('rollingMean', () => {
    it('returns null when fewer values than window', () => {
      expect(rollingMean([1, 2], 3)).toBeNull();
    });

    it('computes mean of last window values', () => {
      expect(rollingMean([1, 2, 3, 4, 5], 3)).toBe(4); // (3+4+5)/3 = 4
    });

    it('handles single value window', () => {
      expect(rollingMean([10], 1)).toBe(10);
    });

    it('handles all same values', () => {
      expect(rollingMean([5, 5, 5, 5], 2)).toBe(5);
    });
  });

  describe('rollingStd', () => {
    it('returns null when fewer values than window', () => {
      expect(rollingStd([1, 2], 3)).toBeNull();
    });

    it('computes std of last window values', () => {
      // values [2, 4] -> mean=3, variance=((2-3)^2+(4-3)^2)/2=1, std=1
      expect(rollingStd([1, 2, 4], 2)).toBe(1);
    });

    it('returns 0 when all values equal', () => {
      expect(rollingStd([5, 5, 5], 2)).toBe(0);
    });

    it('handles single value window', () => {
      expect(rollingStd([10], 1)).toBe(0);
    });
  });
});

describe('funding.ts — feature computation helpers', () => {
  describe('fundingFields', () => {
    it('returns nulls when no funding history', () => {
      const result = fundingFields([], 1000);
      expect(result.fundingRate).toBeNull();
      expect(result.fundingRateAvg8h).toBeNull();
      expect(result.fundingRateSlope).toBeNull();
    });

    it('returns latest fundingRate', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
      ];
      const result = fundingFields(funding, 200);
      expect(result.fundingRate).toBe(0.0002);
    });

    it('computes 8h average (3 periods)', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
        { timestamp: 300, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
      ];
      const result = fundingFields(funding, 300);
      expect(result.fundingRateAvg8h).toBeCloseTo(0.0002, 6); // (0.0001+0.0002+0.0003)/3
    });

    it('computes slope when >= 3 points', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
        { timestamp: 300, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
      ];
      const result = fundingFields(funding, 300);
      expect(result.fundingRateSlope).toBeCloseTo(0.0002, 10); // 0.0003 - 0.0001
    });

    it('returns null slope when < 3 points', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
      ];
      const result = fundingFields(funding, 200);
      expect(result.fundingRateSlope).toBeNull();
    });

    it('filters by timestamp <= t (causal)', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
        { timestamp: 300, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
      ];
      // t=200 should only see first two
      const result = fundingFields(funding, 200);
      expect(result.fundingRate).toBe(0.0002);
      expect(result.fundingRateAvg8h).toBeNull(); // only 2 points
    });
  });

  describe('oiFields', () => {
    it('returns nulls when no OI history', () => {
      const result = oiFields([], 1000, 20);
      expect(result.openInterest).toBeNull();
      expect(result.oiChange).toBeNull();
      expect(result.oiZScore).toBeNull();
    });

    it('filters out null notionalUsd', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: null },
        { timestamp: 300, symbol: 'BTC', openInterest: 3000, notionalUsd: 150000000 },
      ];
      const result = oiFields(oi, 300, 20);
      // Only first and third have notionalUsd
      expect(result.openInterest).toBe(150000000);
    });

    it('computes oiChange when >= 2 valid points', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
      ];
      const result = oiFields(oi, 200, 20);
      expect(result.oiChange).toBe(1.0); // (100M - 50M) / 50M = 1.0
    });

    it('returns null oiChange when < 2 valid points', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: null },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
      ];
      const result = oiFields(oi, 200, 20);
      expect(result.oiChange).toBeNull();
    });

    it('computes oiZScore when >= lookbackBars', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
        { timestamp: 300, symbol: 'BTC', openInterest: 3000, notionalUsd: 150000000 },
      ];
      const result = oiFields(oi, 300, 3);
      expect(result.oiZScore).not.toBeNull();
    });

    it('returns null oiZScore when < lookbackBars', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
      ];
      const result = oiFields(oi, 100, 20);
      expect(result.oiZScore).toBeNull();
    });

    it('filters by timestamp <= t (causal)', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
      ];
      const result = oiFields(oi, 150, 20);
      expect(result.openInterest).toBe(50000000);
    });
  });

  describe('liquidationFields', () => {
    it('computes imbalance and zScore', () => {
      const liquidations = [
        { timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 1000, symbol: 'BTC', side: 'short' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 2000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 2, notionalUsd: 100000 },
      ];
      // windowStart = 2000 - 3*4h = negative, so all included
      const result = liquidationFields(liquidations, 2000, 3, 4 * 3_600_000);
      // long: 50000+100000=150000, short: 50000 -> imbalance = 100000
      expect(result.liquidationImbalance).toBe(100000);
      expect(result.liquidationZScore).not.toBeNull();
    });

    it('handles only long liquidations', () => {
      const liquidations = [
        { timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 2000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
      ];
      const result = liquidationFields(liquidations, 2000, 3, 4 * 3_600_000);
      expect(result.liquidationImbalance).toBe(100000);
      // zScore: values=[50000,50000], mean=50000, std=0 -> null (or handled)
      expect(result.liquidationZScore).toBeNull(); // std is 0, so null
    });

    it('handles only short liquidations', () => {
      const liquidations = [
        { timestamp: 1000, symbol: 'BTC', side: 'short' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 2000, symbol: 'BTC', side: 'short' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
      ];
      const result = liquidationFields(liquidations, 2000, 3, 4 * 3_600_000);
      expect(result.liquidationImbalance).toBe(-100000);
      expect(result.liquidationZScore).toBeNull();
    });

    it('uses windowStart based on candleIntervalMs', () => {
      const liquidations = [
        { timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 1000000000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
      ];
      // With 1h candles (3.6M ms), lookback=2 -> windowStart = t - 7.2M
      // At t=1000000000, only second liquidation in window
      const result = liquidationFields(liquidations, 1000000000, 2, 3_600_000);
      expect(result.liquidationImbalance).toBe(50000);
    });

    it('returns imbalance 0 and null zScore when no liquidations in window', () => {
      const liquidations: LiquidationPoint[] = [];
      const result = liquidationFields(liquidations, 1000, 20, 4 * 3_600_000);
      expect(result.liquidationImbalance).toBe(0);
      expect(result.liquidationZScore).toBeNull();
    });
  });

  describe('basisFields', () => {
    it('returns nulls when no premium index', () => {
      const result = basisFields([], 1000, 20);
      expect(result.basis).toBeNull();
      expect(result.basisZScore).toBeNull();
    });

    it('finds latest basis point <= t', () => {
      const premiumIndex = [
        { timestamp: 100, basis: 0.001 },
        { timestamp: 200, basis: 0.002 },
        { timestamp: 300, basis: 0.003 },
      ];
      const result = basisFields(premiumIndex, 250, 20);
      // latest point with timestamp <= 250 is the one at 200
      expect(result.basis).toBe(0.002);
    });

    it('computes basisZScore when >= lookbackBars', () => {
      const premiumIndex = [
        { timestamp: 100, basis: 0.001 },
        { timestamp: 200, basis: 0.002 },
        { timestamp: 300, basis: 0.003 },
      ];
      const result = basisFields(premiumIndex, 300, 3);
      expect(result.basisZScore).not.toBeNull();
    });

    it('returns null basisZScore when < lookbackBars', () => {
      const premiumIndex = [{ timestamp: 100, basis: 0.001 }];
      const result = basisFields(premiumIndex, 100, 20);
      expect(result.basisZScore).toBeNull();
    });

    it('filters by timestamp <= t (causal)', () => {
      const premiumIndex = [
        { timestamp: 100, basis: 0.001 },
        { timestamp: 200, basis: 0.002 },
      ];
      const result = basisFields(premiumIndex, 150, 20);
      expect(result.basis).toBe(0.001);
    });
  });
});

describe('funding.ts — computeDerivativeFeatures integration', () => {
  const makeCandle = (timestamp: number): Candle => ({
    timestamp,
    open: 50000,
    high: 51000,
    low: 49000,
    close: 50000,
    volume: 1000,
  });

  it('returns features for each candle', () => {
    const candles = [makeCandle(1000), makeCandle(2000), makeCandle(3000)];
    const funding = [{ timestamp: 1000, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 }];
    const oi = [{ timestamp: 1000, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 }];
    const liquidations = [{ timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 }];
    const premiumIndex = [{ timestamp: 1000, basis: 0.001 }];

    const result = computeDerivativeFeatures(candles, funding, oi, liquidations, premiumIndex, 2);
    expect(result).toHaveLength(3);
  });

  it('produces DerivativeFeatures with all fields', () => {
    const candles = [makeCandle(3000)];
    const funding = [
      { timestamp: 1000, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
      { timestamp: 2000, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
      { timestamp: 3000, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
    ];
    const oi = [
      { timestamp: 1000, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
      { timestamp: 2000, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
      { timestamp: 3000, symbol: 'BTC', openInterest: 3000, notionalUsd: 150000000 },
    ];
    const liquidations = [
      { timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
      { timestamp: 2000, symbol: 'BTC', side: 'short' as const, price: 51000, quantity: 1, notionalUsd: 51000 },
      { timestamp: 3000, symbol: 'BTC', side: 'long' as const, price: 52000, quantity: 1, notionalUsd: 52000 },
    ];
    const premiumIndex = [
      { timestamp: 1000, basis: 0.001 },
      { timestamp: 2000, basis: 0.002 },
      { timestamp: 3000, basis: 0.003 },
    ];

    const result = computeDerivativeFeatures(candles, funding, oi, liquidations, premiumIndex, 2);
    const f = result[0];

    expect(f.timestamp).toBe(3000);
    expect(typeof f.fundingRate).toBe('number');
    expect(typeof f.fundingRateAvg8h).toBe('number');
    expect(typeof f.fundingRateSlope).toBe('number');
    expect(typeof f.openInterest).toBe('number');
    expect(typeof f.oiChange).toBe('number');
    expect(typeof f.oiZScore).toBe('number');
    expect(typeof f.liquidationImbalance).toBe('number');
    expect(typeof f.liquidationZScore).toBe('number');
    expect(typeof f.basis).toBe('number');
    expect(typeof f.basisZScore).toBe('number');
  });

  it('handles empty inputs gracefully', () => {
    const candles = [makeCandle(1000), makeCandle(2000)];
    const result = computeDerivativeFeatures(candles, [], [], [], [], 20);
    expect(result).toHaveLength(2);
    expect(result[0].fundingRate).toBeNull();
    expect(result[0].openInterest).toBeNull();
    expect(result[0].liquidationImbalance).toBe(0);
    expect(result[0].basis).toBeNull();
  });

  it('uses 4h default interval when only one candle', () => {
    const candles = [makeCandle(1000)];
    const liquidations = [{ timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 }];
    const result = computeDerivativeFeatures(candles, [], [], liquidations, [], 20);
    // Should not throw and should compute
    expect(result).toHaveLength(1);
  });

  it('computes interval from candles when >= 2', () => {
    const candles = [
      makeCandle(1000),
      makeCandle(1000 + 3_600_000), // 1h apart
    ];
    const liquidations = [
      { timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
      { timestamp: 1000 + 3_600_000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
    ];
    const result = computeDerivativeFeatures(candles, [], [], liquidations, [], 2);
    expect(result).toHaveLength(2);
  });

  it('respects lookbackBars parameter', () => {
    const candles = [
      makeCandle(1000),
      makeCandle(2000),
      makeCandle(3000),
    ];
    const funding = [
      { timestamp: 1000, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
      { timestamp: 2000, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
      { timestamp: 3000, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
    ];
    // With lookback=3, should have enough for zScore
    const result1 = computeDerivativeFeatures(candles, funding, [], [], [], 3);
    // With lookback=5, not enough
    const result2 = computeDerivativeFeatures(candles, funding, [], [], [], 5);
    // Both should return 3 features but with different zScores
    expect(result1[2].fundingRateAvg8h).not.toBeNull();
    expect(result2[2].fundingRateAvg8h).not.toBeNull();
  });
});

describe('funding.ts — type exports', () => {
  it('exports FundingRatePoint', () => {
    const point: FundingRatePoint = {
      timestamp: 1000,
      symbol: 'BTCUSDT',
      fundingRate: 0.0001,
      markPrice: 50000,
    };
    expect(point.fundingRate).toBe(0.0001);
  });

  it('exports OpenInterestPoint', () => {
    const point: OpenInterestPoint = {
      timestamp: 1000,
      symbol: 'BTCUSDT',
      openInterest: 1000,
      notionalUsd: 50000000,
    };
    expect(point.notionalUsd).toBe(50000000);
  });

  it('exports LiquidationPoint', () => {
    const point: LiquidationPoint = {
      timestamp: 1000,
      symbol: 'BTCUSDT',
      side: 'long',
      price: 50000,
      quantity: 1,
      notionalUsd: 50000,
    };
    expect(point.side).toBe('long');
  });

  it('exports DerivativeFeatures', () => {
    const f: DerivativeFeatures = {
      timestamp: 1000,
      fundingRate: 0.0001,
      fundingRateAvg8h: 0.0001,
      fundingRateSlope: 0,
      openInterest: 1000,
      oiChange: 0.1,
      oiZScore: 1.5,
      liquidationImbalance: 1000,
      liquidationZScore: 2.0,
      basis: 0.001,
      basisZScore: 2.5,
    };
    expect(f.fundingRate).toBe(0.0001);
  });
});