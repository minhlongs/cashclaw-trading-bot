import type { Candle } from './fixtures-types';
import { generateSyntheticCandles } from './fixtures-synthetic';

export function generateTrendingCandles(n: number, direction: 'up' | 'down'): Candle[] {
  const trend = direction === 'up' ? 1.5 : -1.5;
  return generateSyntheticCandles(n, trend, 0.3, direction === 'up' ? 80 : 120);
}

export function generateRangingCandles(n: number, amplitude: number = 2, frequency: number = 0.3): Candle[] {
  const candles: Candle[] = [];
  let ts = 1_700_000_000_000, close = 100;
  for (let i = 0; i < n; i++) {
    const open = close, sine = amplitude * Math.sin(i * frequency);
    close = open + sine * 0.1;
    const high = Math.max(close, open) + amplitude * 0.2;
    const low = Math.min(close, open) - amplitude * 0.2;
    candles.push({ timestamp: ts, open, high, low, close, volume: 100 });
    ts += 60_000;
  }
  return candles;
}

export function generateHighVolCandles(n: number): Candle[] {
  return generateSyntheticCandles(n, 0, 8, 100);
}
