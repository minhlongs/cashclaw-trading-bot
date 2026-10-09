import type { IndicatorCandle } from '../indicator-types';
import type { PairPanel } from './types';

export function causalSlice(
  panel: PairPanel,
  window: number,
  asOfTime: number,
): { timestamps: number[]; a: number[]; b: number[] } {
  const timestamps: number[] = [];
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < panel.timestamps.length; i++) {
    if (panel.timestamps[i]! >= asOfTime) continue;
    timestamps.push(panel.timestamps[i]!);
    a.push(panel.closesA[i]!);
    b.push(panel.closesB[i]!);
  }
  const start = Math.max(0, a.length - window);
  return { timestamps: timestamps.slice(start), a: a.slice(start), b: b.slice(start) };
}

export function toCandles(timestamps: readonly number[], closes: readonly number[]): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]!;
    out.push({
      timestamp: timestamps[i]!,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    });
  }
  return out;
}
