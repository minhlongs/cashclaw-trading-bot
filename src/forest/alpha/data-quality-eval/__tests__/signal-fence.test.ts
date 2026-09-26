import { describe, expect, it, vi } from 'vitest';
import { evaluateDataQuality } from '../evaluate';
import {
  assertDataQualityValid,
  DataQualityAssertionError,
  protectSignalGeneration,
} from '../signal-fence';
import type { Candle, DataQualityEvalInput } from '../types';

function createValidCandles(
  count: number = 8,
  intervalMs: number = 60_000,
  startEpoch: number = 1_700_000_000_000,
): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: startEpoch + i * intervalMs,
    open: 100 + i,
    high: 110 + i,
    low: 95 + i,
    close: 105 + i,
    volume: 1000 + i * 20,
  }));
}

describe('Signal Fence (Fail-Closed Execution Gate)', () => {
  const baseTime = 1_700_000_000_000;
  const interval = 60_000;

  it('allows signal generation when data is VALID', () => {
    const candles = createValidCandles(5, interval, baseTime);
    const input: DataQualityEvalInput = {
      series: candles,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTime + 5 * interval,
    };

    const mockSignal = { action: 'BUY', confidence: 0.85 };
    const generator = vi.fn().mockReturnValue(mockSignal);

    const result = protectSignalGeneration(input, generator);

    expect(result.status).toBe('VALID');
    expect(result.signal).toEqual(mockSignal);
    expect(result.report.status).toBe('VALID');
    expect(generator).toHaveBeenCalledTimes(1);
    expect(generator).toHaveBeenCalledWith(candles);
  });

  it('fails closed: returns DATA_INVALID, signal null, and NEVER calls generator on bad data', () => {
    const candles = createValidCandles(5, interval, baseTime);
    // Corrupt candle 2 with impossible OHLC (high < low)
    candles[2] = { ...candles[2], high: 50, low: 150 };

    const input: DataQualityEvalInput = {
      series: candles,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTime + 5 * interval,
    };

    const generator = vi.fn().mockReturnValue({ action: 'BUY' });

    const result = protectSignalGeneration(input, generator);

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(result.report.status).toBe('DATA_INVALID');
    expect(result.report.summary.violationCount).toBeGreaterThanOrEqual(1);

    // CRITICAL: Prove generator was NEVER called (zero silent signal production)
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed when duplicate timestamps or negative volume are present', () => {
    const candles = createValidCandles(5, interval, baseTime);
    candles[3] = { ...candles[2] }; // duplicate timestamp
    candles[4] = { ...candles[4], volume: -500 }; // negative volume

    const input: DataQualityEvalInput = {
      series: candles,
      symbol: 'ETH/USDT',
      timeframe: '1m',
      asOf: baseTime + 5 * interval,
    };

    const generator = vi.fn().mockReturnValue(42);

    const result = protectSignalGeneration(input, generator);

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('assertDataQualityValid passes silently on VALID reports', () => {
    const candles = createValidCandles(5, interval, baseTime);
    const report = evaluateDataQuality({
      series: candles,
      symbol: 'SOL/USDT',
      timeframe: '1m',
      asOf: baseTime + 5 * interval,
    });

    expect(report.status).toBe('VALID');
    expect(() => assertDataQualityValid(report)).not.toThrow();
  });

  it('assertDataQualityValid throws DataQualityAssertionError on DATA_INVALID reports', () => {
    const candles = createValidCandles(5, interval, baseTime);
    candles[1] = { ...candles[1], volume: -1 };

    const report = evaluateDataQuality({
      series: candles,
      symbol: 'SOL/USDT',
      timeframe: '1m',
      asOf: baseTime + 5 * interval,
    });

    expect(report.status).toBe('DATA_INVALID');

    let thrownError: unknown;
    try {
      assertDataQualityValid(report);
    } catch (err: unknown) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(DataQualityAssertionError);
    const assertionErr = thrownError as DataQualityAssertionError;
    expect(assertionErr.name).toBe('DataQualityAssertionError');
    expect(assertionErr.report).toBe(report);
    expect(assertionErr.message).toContain('SOL/USDT');
    expect(assertionErr.message).toContain('DATA_INVALID');
    expect(assertionErr.message).toContain('volume_anomalies');
  });
});
