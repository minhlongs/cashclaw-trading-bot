import type { Candle } from '@/forest/backtest/ohlcv';
import type { VolBucket } from './report';

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function classifyVol(
  candles: Candle[],
  thresholds: { low: number; high: number } = { low: 0.01, high: 0.03 },
): VolBucket[] {
  if (candles.length < 2) return candles.map(() => 'medium' as VolBucket);
  return candles.map((c) => {
    const range = (c.high - c.low) / (c.close || 1);
    if (range < thresholds.low) return 'low' as VolBucket;
    if (range > thresholds.high) return 'high' as VolBucket;
    return 'medium' as VolBucket;
  });
}

export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function computeSortino(pnls: number[]): number | null {
  if (pnls.length < 2) return null;
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const downsideVar = pnls.filter((p) => p < 0).reduce((a, p) => a + p ** 2, 0) / pnls.length;
  const downsideStd = Math.sqrt(downsideVar);
  return downsideStd === 0 ? null : mean / downsideStd;
}
