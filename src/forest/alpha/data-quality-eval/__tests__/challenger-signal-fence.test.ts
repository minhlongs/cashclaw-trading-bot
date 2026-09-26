import { describe, expect, it, vi } from 'vitest';
import { protectSignalGeneration } from '../signal-fence';
import type { Candle, DataQualityEvalInput } from '../types';

function createBaseCandles(count: number = 6, intervalMs: number = 60_000, start: number = 1_700_000_000_000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: start + i * intervalMs,
    open: 100 + i,
    high: 110 + i,
    low: 95 + i,
    close: 105 + i,
    volume: 1000 + i * 10,
  }));
}

describe('Challenger M2-1: Empirical Signal Fence Stress Harness', () => {
  const baseTime = 1_700_000_000_000;
  const interval = 60_000;

  it('fails closed on timestamp monotonicity inversion (t_i < t_{i-1})', () => {
    const candles = createBaseCandles(5, interval, baseTime);
    candles[3] = { ...candles[3], timestamp: candles[2].timestamp - 1000 };
    const generator = vi.fn().mockReturnValue({ alpha: 1.0 });

    const result = protectSignalGeneration(
      { series: candles, symbol: 'BTC/USDT', timeframe: '1m', asOf: baseTime + 10 * interval },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed on flat non-increasing timestamps (t_i == t_{i-1})', () => {
    const candles = createBaseCandles(4, interval, baseTime);
    candles[2] = { ...candles[2], timestamp: candles[1].timestamp };
    const generator = vi.fn().mockReturnValue('signal');

    const result = protectSignalGeneration(
      { series: candles, symbol: 'ETH/USDT', timeframe: '1m', asOf: baseTime + 10 * interval },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed on duplicate candle timestamps', () => {
    const candles = createBaseCandles(5, interval, baseTime);
    candles[4] = { ...candles[4], timestamp: candles[0].timestamp };
    const generator = vi.fn();

    const result = protectSignalGeneration(
      { series: candles, symbol: 'SOL/USDT', timeframe: '1m', asOf: baseTime + 10 * interval },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed on missing interval gaps', () => {
    const candles = [
      { timestamp: baseTime, open: 100, high: 110, low: 90, close: 105, volume: 100 },
      { timestamp: baseTime + 600_000, open: 101, high: 111, low: 91, close: 106, volume: 100 },
    ];
    const generator = vi.fn();

    const result = protectSignalGeneration(
      { series: candles, symbol: 'BTC/USDT', timeframe: '1m', asOf: baseTime + 700_000 },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it.each([
    ['high < low', { high: 80, low: 90 }],
    ['high < max(open, close)', { open: 120, high: 110, low: 90, close: 100 }],
    ['low > min(open, close)', { open: 100, high: 110, low: 95, close: 90 }],
    ['negative open', { open: -10 }],
    ['zero close', { close: 0 }],
    ['infinite high', { high: Infinity }],
    ['NaN close', { close: NaN }],
  ])('fails closed on impossible OHLC: %s', (_, mutation) => {
    const candles = createBaseCandles(4, interval, baseTime);
    candles[1] = { ...candles[1], ...mutation };
    const generator = vi.fn();

    const result = protectSignalGeneration(
      { series: candles, symbol: 'AVAX/USDT', timeframe: '1m', asOf: baseTime + 10 * interval },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed on future data contamination', () => {
    const candles = createBaseCandles(4, interval, baseTime);
    const generator = vi.fn();

    const result = protectSignalGeneration(
      { series: candles, symbol: 'LINK/USDT', timeframe: '1m', asOf: baseTime + interval },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed on stale data feed', () => {
    const candles = createBaseCandles(4, interval, baseTime);
    const generator = vi.fn();

    const result = protectSignalGeneration(
      { series: candles, symbol: 'NEAR/USDT', timeframe: '1m', asOf: baseTime + 1000 * interval },
      generator,
      { staleness: { asOf: baseTime + 1000 * interval, maxStaleIntervals: 2 } },
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it.each([
    ['negative volume', { volume: -1 }],
    ['infinite volume', { volume: Infinity }],
    ['NaN volume', { volume: NaN }],
  ])('fails closed on volume anomaly: %s', (_, mutation) => {
    const candles = createBaseCandles(4, interval, baseTime);
    candles[2] = { ...candles[2], ...mutation };
    const generator = vi.fn();

    const result = protectSignalGeneration(
      { series: candles, symbol: 'ARB/USDT', timeframe: '1m', asOf: baseTime + 10 * interval },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed on exchange outage freeze (identical consecutive bars)', () => {
    const candles = createBaseCandles(12, interval, baseTime);
    for (let i = 2; i < 9; i++) {
      candles[i] = { ...candles[1], timestamp: baseTime + i * interval };
    }
    const generator = vi.fn();

    const result = protectSignalGeneration(
      { series: candles, symbol: 'OP/USDT', timeframe: '1m', asOf: baseTime + 15 * interval },
      generator,
      { outage: { maxConsecutiveIdenticalBars: 4 } },
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('asserts zero silent forward-filling and zero series mutation', () => {
    const originalCandles = createBaseCandles(6, interval, baseTime);
    const frozenSeries = Object.freeze(originalCandles.map((c) => Object.freeze({ ...c })));
    const input: DataQualityEvalInput = {
      series: frozenSeries,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTime + 6 * interval,
    };

    let receivedCandles: readonly Candle[] | null = null;
    const generator = vi.fn().mockImplementation((c: readonly Candle[]) => {
      receivedCandles = c;
      return { trade: 'LONG' };
    });

    const result = protectSignalGeneration(input, generator);

    expect(result.status).toBe('VALID');
    expect(result.signal).toEqual({ trade: 'LONG' });
    expect(generator).toHaveBeenCalledTimes(1);
    expect(receivedCandles).toBe(frozenSeries);
    expect(result.report.validationResult.totalCandles).toBe(6);
  });
});
