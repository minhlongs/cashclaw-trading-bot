import type { Candle } from './fixtures-types';
import { generateSyntheticCandles } from './fixtures-synthetic';

export function generateTrendingCandles(n: number, direction: 'up' | 'down'): Candle[] {
  const trend = direction === 'up' ? 1.5 : -1.5;
  return generateSyntheticCandles(n, trend, 0.3, direction === 'up' ? 80 : 120);
}

export function generateHighVolCandles(n: number): Candle[] {
  return generateSyntheticCandles(n, 0, 8, 100);
}
