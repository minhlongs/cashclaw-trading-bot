import type { Candle } from '../types';

export function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    timestamp: 1_700_000_000_000,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1_000,
    ...overrides,
  };
}

export function makeSeries(count: number, intervalMs = 60_000, baseTs = 1_700_000_000_000): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      timestamp: baseTs + i * intervalMs,
      open: 100 + (i % 5),
      high: 110 + (i % 5),
      low: 90 + (i % 5),
      close: 105 + (i % 5),
      volume: 1_000 + i * 10,
    });
  }
  return candles;
}
