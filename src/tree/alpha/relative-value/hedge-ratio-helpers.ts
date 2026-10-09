import type { PairPanel } from './types';

export function alignedCloses(
  panel: PairPanel,
  window: number,
  asOfTime: number,
): { a: number[]; b: number[] } {
  const a: number[] = [], b: number[] = [];
  for (let i = 0; i < panel.timestamps.length; i++) {
    if (panel.timestamps[i]! >= asOfTime) continue;
    a.push(panel.closesA[i]!);
    b.push(panel.closesB[i]!);
  }
  const start = Math.max(0, a.length - window);
  return { a: a.slice(start), b: b.slice(start) };
}

export function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}
