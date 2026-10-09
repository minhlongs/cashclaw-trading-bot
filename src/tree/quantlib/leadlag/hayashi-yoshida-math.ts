import type { AsynchronousTick } from './hayashi-yoshida-types';

export interface IntervalReturn {
  readonly start: number;
  readonly end: number;
  readonly ret: number;
}

export function computeIntervalReturns(ticks: readonly AsynchronousTick[]): IntervalReturn[] {
  const list: IntervalReturn[] = [];
  for (let i = 0; i < ticks.length - 1; i++) {
    const p0 = Math.max(1e-8, ticks[i].price);
    const p1 = Math.max(1e-8, ticks[i + 1].price);
    list.push({
      start: ticks[i].timestampMs,
      end: ticks[i + 1].timestampMs,
      ret: Math.log(p1 / p0),
    });
  }
  return list;
}

export function computeLagCovariance(
  rxList: readonly IntervalReturn[],
  ryList: readonly IntervalReturn[],
  lag: number
): number {
  let cov = 0;
  for (const rx of rxList) {
    for (const ry of ryList) {
      if (Math.max(rx.start, ry.start - lag) < Math.min(rx.end, ry.end - lag)) {
        cov += rx.ret * ry.ret;
      }
    }
  }
  return cov;
}
