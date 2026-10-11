import type { Candle } from './fixtures-types';

export function generateSyntheticCandles(
  n: number,
  trend: number = 0,
  volatility: number = 1,
  basePrice: number = 100,
  baseTs: number = 1_700_000_000_000,
): Candle[] {
  const candles: Candle[] = [];
  let close = basePrice;
  for (let i = 0; i < n; i++) {
    const drift = trend;
    const shock = volatility * (Math.sin(i * 1.3) + Math.cos(i * 0.7) * 0.5);
    const open = close;
    close = Math.max(close * 0.5, close + drift + shock);
    const high = close + volatility * Math.abs(Math.sin(i * 2.1)) * 0.5;
    const low = close - volatility * Math.abs(Math.cos(i * 1.9)) * 0.5;
    candles.push({
      timestamp: baseTs + i * 60_000,
      open,
      high: Math.max(high, close, open),
      low: Math.min(low, close, open),
      close,
      volume: 100 + Math.abs(Math.sin(i)) * 50,
    });
  }
  return candles;
}
