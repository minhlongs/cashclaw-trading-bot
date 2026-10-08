import { describe, expect, it } from 'vitest';
import {
  evaluateDataQuality,
  protectSignalGeneration,
} from '@/forest/alpha/data-quality-eval';
import {
  BASE_TIMESTAMP,
  createBaseCandle,
  generateGappedSeries,
  generateMonotonicCandles,
  generateMultiFeedPairs,
  generateOutageSeries,
} from './data-quality-fixtures';

const c = (ts: number, overrides?: Parameters<typeof createBaseCandle>[0]) =>
  createBaseCandle({ timestamp: ts, ...overrides });

export function registerTier4RealWorldTests(): void {
  describe('Tier 4: Real-World Market Topology Scenarios (10 Scenarios)', () => {
    it('S1: Exchange Maintenance Downtime Gap', () => {
      // 4-hour gap during 1m maintenance window
      const series = generateGappedSeries(20, 10, 240, 60_000);
      const report = evaluateDataQuality({
        series,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: series[series.length - 1].timestamp,
      });
      expect(report.status).toBe('DATA_INVALID');
      expect(report.summary.failedChecks).toBeGreaterThanOrEqual(1);
      expect(report.validationResult.violations.some((v) => v.dimension === 'missing_intervals')).toBe(true);
    });

    it('S2: Flash Crash Price Spike Anomaly', () => {
      const series = generateMonotonicCandles(10);
      // Malformed flash wick with High strictly below Close
      series[5] = { ...series[5], high: 50, open: 100, close: 110 };
      const report = evaluateDataQuality({
        series,
        symbol: 'ETH/USDT',
        timeframe: '1m',
      });
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'impossible_ohlc')).toBe(true);
    });

    it('S3: Frozen Feed Flatlines (Matching Engine Stall)', () => {
      // 10 identical consecutive bars
      const series = generateOutageSeries(20, 10, 5);
      const report = evaluateDataQuality({
        series,
        symbol: 'SOL/USDT',
        timeframe: '1m',
      });
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'exchange_outage')).toBe(true);
      expect(report.recommendations.some((r) => r.includes('exchange freeze'))).toBe(true);
    });

    it('S4: Cross-Exchange Clock Desynchronization (NTP Drift)', () => {
      // Secondary feed drifted by 45 seconds (45,000ms), exceeding 5s tolerance
      const { primary, secondary } = generateMultiFeedPairs(15, { secondarySkewMs: 45_000 });
      const report = evaluateDataQuality(
        { series: primary, secondarySeries: secondary, symbol: 'BTC/USDT', timeframe: '1m' },
        { alignment: { toleranceMs: 5_000 } },
      );
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'cross_source_alignment')).toBe(true);
    });

    it('S5: Out-of-Order WebSocket Bursts (Network Jitter)', () => {
      // Candle at index 4 arrives before index 3
      const series = generateMonotonicCandles(10);
      const temp = series[4].timestamp;
      series[4] = { ...series[4], timestamp: series[3].timestamp - 1000 };
      const report = evaluateDataQuality({ series, symbol: 'AVAX/USDT', timeframe: '1m' });
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'timestamp_monotonicity')).toBe(true);
    });

    it('S6: Zero-Volume Liquidity Freeze', () => {
      // Consecutive zero volume streak in order book
      const series = generateMonotonicCandles(10);
      for (let i = 3; i <= 6; i++) {
        series[i] = { ...series[i], volume: 0 };
      }
      const report = evaluateDataQuality(
        { series, symbol: 'DOGE/USDT', timeframe: '1m' },
        { volume: { maxConsecutiveZeroVolume: 2 } },
      );
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'volume_anomalies')).toBe(true);
    });

    it('S7: Corrupted CSV Ingestion (NaN Header/Footer Artifacts)', () => {
      const series = [c(BASE_TIMESTAMP), c(BASE_TIMESTAMP + 60_000, { open: -999.0 }), c(BASE_TIMESTAMP + 120_000)];
      const report = evaluateDataQuality({ series, symbol: 'LINK/USDT', timeframe: '1m' });
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'impossible_ohlc')).toBe(true);
    });

    it('S8: Backtest Lookahead Leakage Prevention', () => {
      const asOf = BASE_TIMESTAMP + 180_000;
      // 5 candles where last candle is at BASE_TIMESTAMP + 240_000 (future relative to asOf)
      const series = generateMonotonicCandles(5, BASE_TIMESTAMP, 60_000);
      const report = evaluateDataQuality({ series, symbol: 'UNI/USDT', timeframe: '1m', asOf });
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'future_data')).toBe(true);
    });

    it('S9: Fail-Closed Signal Fence Protection', () => {
      let generatorInvoked = false;
      const badSeries = generateGappedSeries(10, 5, 4, 60_000);
      const badResult = protectSignalGeneration(
        { series: badSeries, symbol: 'BTC/USDT', timeframe: '1m' },
        () => {
          generatorInvoked = true;
          return { action: 'BUY', targetPrice: 50_000 };
        },
      );
      expect(badResult.status).toBe('DATA_INVALID');
      expect(badResult.signal).toBeNull();
      expect(generatorInvoked).toBe(false);

      const goodSeries = generateMonotonicCandles(10, BASE_TIMESTAMP, 60_000);
      const goodResult = protectSignalGeneration(
        { series: goodSeries, symbol: 'BTC/USDT', timeframe: '1m', asOf: goodSeries[9].timestamp },
        () => ({ action: 'BUY', targetPrice: 50_000 }),
      );
      expect(goodResult.status).toBe('VALID');
      expect(goodResult.signal).toEqual({ action: 'BUY', targetPrice: 50_000 });
    });

    it('S10: Disjoint Multi-Exchange Feeds (Secondary Disparity)', () => {
      const primary = generateMonotonicCandles(20);
      const report = evaluateDataQuality({
        series: primary,
        secondarySeries: [], // Disjoint empty secondary series
        symbol: 'ETH/USDT',
        timeframe: '1m',
      });
      expect(report.status).toBe('DATA_INVALID');
      expect(report.validationResult.violations.some((v) => v.dimension === 'cross_source_alignment')).toBe(true);
    });
  });
}
