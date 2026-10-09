import type { Candle } from '@/forest/backtest/ohlcv';
import { mean } from './feature-helpers-stats';

export function trueRanges(candles: Candle[]): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) trs.push(candles[i].high - candles[i].low);
    else {
      const prev = candles[i - 1], curr = candles[i];
      trs.push(Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close)));
    }
  }
  return trs;
}

export function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const avgY = sumY / n;
  return avgY !== 0 ? slope / avgY : 0;
}

export function adxLike(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high, down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const trs = trueRanges(candles);
  const smoothedTR = mean(trs.slice(-period));
  if (smoothedTR === 0) return 0;
  const pDI = (mean(plusDM.slice(-period)) / smoothedTR) * 100;
  const mDI = (mean(minusDM.slice(-period)) / smoothedTR) * 100;
  const sum = pDI + mDI;
  return sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
}
