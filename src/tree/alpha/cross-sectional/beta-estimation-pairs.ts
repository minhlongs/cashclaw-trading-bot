import type { AssetReturnSeries } from './types';

export function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`estimateRollingBetas: ${name} must be a positive integer`);
  }
}

export function requireAlignedSeries(series: AssetReturnSeries): void {
  if (series.timestamps.length !== series.returns.length) {
    throw new Error(`estimateRollingBetas: ${series.symbol} timestamps/returns length mismatch`);
  }
}

export function alignedPairs(
  series: AssetReturnSeries,
  benchmarkByTs: ReadonlyMap<number, number>,
  sizingTime: number,
  window: number,
): { asset: number[]; benchmark: number[] } {
  const asset: number[] = [];
  const benchmark: number[] = [];
  for (let i = 0; i < series.timestamps.length; i++) {
    const ts = series.timestamps[i]!;
    if (ts >= sizingTime) continue;
    const b = benchmarkByTs.get(ts);
    if (b === undefined) continue;
    asset.push(series.returns[i]!);
    benchmark.push(b);
  }
  const start = Math.max(0, asset.length - window);
  return { asset: asset.slice(start), benchmark: benchmark.slice(start) };
}

export function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}
