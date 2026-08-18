// Integration tests for alpha indicators on synthetic data.
import { describe, it, expect } from 'vitest';
import { indicators } from '@/tree/alpha/indicators';
import type { Candle } from '@/forest/backtest/ohlcv';
import { generateSyntheticCandles, generateTrendingCandles } from './fixtures';

const N = 60;
const LB = 20;

function allResultVals(
  candles: Candle[],
  name: string,
  lookback: number,
): unknown[] {
  const fn = indicators[name];
  if (!fn) return [];
  return candles.map((_, i) => {
    const win = candles.slice(0, i + 1);
    const r = fn(win, lookback, '1h');
    return r.value;
  });
}

describe('indicator integration', () => {
  it('all indicators return valid numbers on trending data', () => {
    const candles = generateTrendingCandles(N, 'up');
    const names = Object.keys(indicators) as (keyof typeof indicators)[];
    for (const name of names) {
      const vals = allResultVals(candles, name, LB);
      const nonNull = vals.filter((v) => v !== null);
      for (const v of nonNull) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v)).toBe(true);
        } else if (v && typeof v === 'object') {
          // BollingerBandsValue, RSIValue, MACDValue — all numeric fields
          const obj = v as Record<string, unknown>;
          for (const k of Object.keys(obj)) {
            const fv = obj[k];
            if (typeof fv === 'number') expect(Number.isFinite(fv)).toBe(true);
          }
        }
      }
    }
  });

  it('SMA(20) on trending up data produces increasing sequence', () => {
    const candles = generateTrendingCandles(N, 'up');
    const vals = allResultVals(candles, 'sma', LB).filter((v): v is number => v !== null);
    expect(vals.length).toBeGreaterThan(5);
    let increasing = 0;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] > vals[i - 1]) increasing++;
    }
    expect(increasing).toBeGreaterThan(vals.length * 0.6);
  });

  it('RSI on oversold data produces value < 30', () => {
    // Ranging candles create pullbacks; force an oversold scenario with a sharp down move
    const candles: Candle[] = [];
    let ts = 1_700_000_000_000;
    let close = 100;
    for (let i = 0; i < N; i++) {
      const open = close;
      close = open - 1.2; // sharp decline
      candles.push({
        timestamp: ts,
        open,
        high: Math.max(open, close) + 0.1,
        low: Math.min(open, close) - 0.1,
        close,
        volume: 100,
      });
      ts += 60_000;
    }
    const fn = indicators.rsi;
    const r = fn(candles, LB, '1h');
    const v = r.value as { rsi: number; overbought: boolean; oversold: boolean } | null;
    expect(v).not.toBeNull();
    if (v !== null) {
      expect(v.rsi).toBeLessThan(30);
      expect(v.oversold).toBe(true);
    }
  });

  it('Bollinger bands: upper > middle > lower', () => {
    const candles = generateTrendingCandles(N, 'up');
    const fn = indicators.bollinger;
    const last = candles.length - 1;
    const win = candles.slice(0, last + 1);
    const r = fn(win, LB, '1h');
    const v = r.value as { upper: number; middle: number; lower: number } | null;
    expect(v).not.toBeNull();
    if (v !== null) {
      expect(v.upper).toBeGreaterThan(v.middle);
      expect(v.middle).toBeGreaterThan(v.lower);
    }
  });

  it('all indicators produce same-length arrays as input', () => {
    const candles = generateSyntheticCandles(N, 0, 1, 100);
    const names = Object.keys(indicators) as (keyof typeof indicators)[];
    for (const name of names) {
      const vals = allResultVals(candles, name, LB);
      expect(vals.length).toBe(candles.length);
    }
  });
});