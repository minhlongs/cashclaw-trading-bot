import { describe, it, expect } from 'vitest';
import {
  computeDerivativeFeatures,
  type Candle,
  type FundingRatePoint,
  type OpenInterestPoint,
  type LiquidationPoint,
  type DerivativeFeatures,
} from '../funding';

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

  it('produces DerivativeFeatures with all expected fields', () => {
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

  it('uses default interval and respects lookbackBars', () => {
    const candles = [makeCandle(1000)];
    const liquidations = [{ timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 }];
    const result = computeDerivativeFeatures(candles, [], [], liquidations, [], 20);
    expect(result).toHaveLength(1);
  });
});

describe('funding.ts — type exports', () => {
  it('exports FundingRatePoint and OpenInterestPoint', () => {
    const point: FundingRatePoint = {
      timestamp: 1000,
      symbol: 'BTCUSDT',
      fundingRate: 0.0001,
      markPrice: 50000,
    };
    expect(point.fundingRate).toBe(0.0001);

    const oiPoint: OpenInterestPoint = {
      timestamp: 1000,
      symbol: 'BTCUSDT',
      openInterest: 1000,
      notionalUsd: 50000000,
    };
    expect(oiPoint.notionalUsd).toBe(50000000);
  });

  it('exports LiquidationPoint and DerivativeFeatures', () => {
    const liq: LiquidationPoint = {
      timestamp: 1000,
      symbol: 'BTCUSDT',
      side: 'long',
      price: 50000,
      quantity: 1,
      notionalUsd: 50000,
    };
    expect(liq.side).toBe('long');

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
