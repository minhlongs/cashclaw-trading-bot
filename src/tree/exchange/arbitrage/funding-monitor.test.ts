import { describe, it, expect, beforeEach } from 'vitest';
import { FundingRateMonitor } from './funding-monitor';
import { computeAnnualizedFundingRate } from './basis-calculator';
import type { FundingRateRecord } from './funding-types';

describe('FundingRateMonitor', () => {
  let monitor: FundingRateMonitor;

  beforeEach(() => {
    monitor = new FundingRateMonitor();
  });

  it('records and retrieves funding rates correctly', () => {
    const rateRecord: FundingRateRecord = {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      rate: 0.0001,
      annualizedRate: computeAnnualizedFundingRate(0.0001),
      nextFundingTimeMs: 1700000000,
      timestampMs: 1700000000,
    };

    monitor.recordRate(rateRecord);
    expect(monitor.getRate('BTC/USDT', 'binance')).toEqual(rateRecord);
    expect(monitor.getRate('BTC/USDT', 'okx')).toBeNull();
    expect(monitor.getRate('ETH/USDT', 'binance')).toBeNull();
  });

  it('scans and sorts viable arbitrage opportunities', () => {
    const binanceRate: FundingRateRecord = {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      rate: 0.0006, // High positive
      annualizedRate: computeAnnualizedFundingRate(0.0006),
      nextFundingTimeMs: 1700000000,
      timestampMs: 1700000000,
    };

    const okxRate: FundingRateRecord = {
      exchange: 'okx',
      symbol: 'BTC/USDT',
      rate: 0.0001, // Low positive
      annualizedRate: computeAnnualizedFundingRate(0.0001),
      nextFundingTimeMs: 1700000000,
      timestampMs: 1700000000,
    };

    const bybitRate: FundingRateRecord = {
      exchange: 'bybit',
      symbol: 'BTC/USDT',
      rate: 0.0002, // Mid
      annualizedRate: computeAnnualizedFundingRate(0.0002),
      nextFundingTimeMs: 1700000000,
      timestampMs: 1700000000,
    };

    monitor.recordRate(binanceRate);
    monitor.recordRate(okxRate);
    monitor.recordRate(bybitRate);

    const opps = monitor.scanOpportunities('BTC/USDT');
    expect(opps.length).toBeGreaterThan(0);
    // Highest yield pair should be binance (short) vs okx (long)
    expect(opps[0].shortVenue).toBe('binance');
    expect(opps[0].longVenue).toBe('okx');

    monitor.clear();
    expect(monitor.scanOpportunities('BTC/USDT')).toHaveLength(0);
  });
});
