import { describe, expect, it } from 'vitest';
import type { IndicatorCandle } from './indicator-types';
import { bollingerBands, computeRSI, indicators, sma } from './indicators';

function makeCandle(close: number, vol = 100, ts = 1000, high?: number, low?: number): IndicatorCandle {
  return {
    timestamp: ts,
    open: close,
    high: high ?? close + 1,
    low: low ?? Math.max(0, close - 1),
    close,
    volume: vol,
  };
}

describe('indicator-math primitives', () => {
  it('sma returns null if insufficient data, computes mean otherwise', () => {
    expect(sma([10, 20], 3)).toBeNull();
    expect(sma([10, 20, 30], 3)).toBe(20);
    expect(sma([5, 10, 20, 30], 3)).toBe(20);
  });

  it('computeRSI handles all-gains, all-losses, and mixed deltas', () => {
    expect(computeRSI([10, 11], 2)).toBeNull();
    expect(computeRSI([10, 12, 14, 16], 3)).toBe(100);
    expect(computeRSI([16, 14, 12, 10], 3)).toBe(0);
    const mixed = computeRSI([10, 12, 11, 13, 12], 4);
    expect(mixed).toBeGreaterThan(0);
    expect(mixed).toBeLessThan(100);
  });

  it('bollingerBands handles insufficient data, zero stdDev, and zero middle', () => {
    expect(bollingerBands([10, 20], 3)).toBeNull();
    const flat = bollingerBands([10, 10, 10], 3);
    expect(flat).toEqual({ upper: 10, middle: 10, lower: 10, bandwidth: 0, percentB: 0.5 });
    const zeroMid = bollingerBands([-5, 5], 2);
    expect(zeroMid?.middle).toBe(0);
    expect(zeroMid?.bandwidth).toBe(0);
  });
});

describe('indicators edge cases: empty and insufficient candles', () => {
  const allNames = Object.keys(indicators);

  it.each(allNames)('%s handles empty candles safely', (name) => {
    const res = indicators[name]([], 10, '15m');
    expect(res).toMatchObject({
      name,
      timeframe: '15m',
      lookback: 10,
      causal: true,
      source: 'ohlcv',
      availability: 'always',
      timestamp: 0,
      value: null,
    });
  });

  it.each(allNames)('%s returns null value on insufficient candles', (name) => {
    const resSingle = indicators[name]([makeCandle(100)], 10);
    expect(resSingle.value).toBeNull();

    const resFew = indicators[name]([makeCandle(100, 100, 1000), makeCandle(101, 100, 2000)], 10);
    expect(resFew.value).toBeNull();
    expect(resFew.timestamp).toBe(2000);
  });
});

describe('technical indicators happy path and boundaries', () => {
  const candles = Array.from({ length: 40 }, (_, i) => makeCandle(100 + i, 100, 1000 + i * 60));

  it('sma and ema calculate valid values', () => {
    const s = indicators.sma(candles, 10);
    const e = indicators.ema(candles, 10);
    expect(s.value).toBe(134.5);
    expect(typeof e.value).toBe('number');
  });

  it('rsi detects overbought and oversold states', () => {
    const rUp = indicators.rsi(candles, 14);
    expect((rUp.value as { overbought: boolean }).overbought).toBe(true);
    const downCandles = Array.from({ length: 40 }, (_, i) => makeCandle(200 - i, 100, 1000 + i * 60));
    const rDown = indicators.rsi(downCandles, 14);
    expect((rDown.value as { oversold: boolean }).oversold).toBe(true);
  });

  it('atr and bollinger compute positive ranges and valid bands', () => {
    const a = indicators.atr(candles, 14);
    expect(Number(a.value)).toBeGreaterThan(0);
    const bb = indicators.bollinger(candles, 20);
    const v = bb.value as { upper: number; middle: number; lower: number };
    expect(v.upper).toBeGreaterThan(v.middle);
    expect(v.middle).toBeGreaterThan(v.lower);
  });

  it('macd returns valid line, signal, and histogram', () => {
    const m = indicators.macd(candles, 12);
    const mv = m.value as { macd: number; signal: number; histogram: number };
    expect(mv.histogram).toBeCloseTo(mv.macd - mv.signal, 8);
  });
});

describe('statistical indicators happy path and zero-division branches', () => {
  it('volume_zscore handles mean=0, sd=0, and valid z-score', () => {
    const zeroVol = [makeCandle(10, 0, 1), makeCandle(10, 0, 2)];
    expect(indicators.volume_zscore(zeroVol, 2).value).toBeNull();
    const flatVol = [makeCandle(10, 100, 1), makeCandle(10, 100, 2)];
    expect(indicators.volume_zscore(flatVol, 2).value).toBe(0);
    const variedVol = [makeCandle(10, 50, 1), makeCandle(10, 150, 2)];
    expect(Number(indicators.volume_zscore(variedVol, 2).value)).toBeGreaterThan(0);
  });

  it('returns and log_returns handle zero and non-positive prices', () => {
    const zeroPrice = [makeCandle(0, 100, 1), makeCandle(10, 100, 2)];
    expect(indicators.returns(zeroPrice, 1).value).toBeNull();
    expect(indicators.log_returns(zeroPrice, 1).value).toBeNull();
    const valid = [makeCandle(100, 100, 1), makeCandle(110, 100, 2)];
    expect(indicators.returns(valid, 1).value).toBeCloseTo(0.1, 5);
    expect(indicators.log_returns(valid, 1).value).toBeCloseTo(Math.log(1.1), 5);
  });

  it('momentum calculates raw price difference', () => {
    const valid = [makeCandle(100, 100, 1), makeCandle(115, 100, 2)];
    expect(indicators.momentum(valid, 1).value).toBe(15);
  });

  it('realized_volatility handles non-positive prices and valid volatility', () => {
    const invalid = [makeCandle(0, 100, 1), makeCandle(0, 100, 2), makeCandle(0, 100, 3)];
    expect(indicators.realized_volatility(invalid, 2).value).toBeNull();
    const valid = [makeCandle(100, 100, 1), makeCandle(105, 100, 2), makeCandle(102, 100, 3)];
    expect(Number(indicators.realized_volatility(valid, 2).value)).toBeGreaterThan(0);
  });

  it('distance_from_ma handles ma=0 and valid distance', () => {
    const zeroMa = [makeCandle(0, 100, 1), makeCandle(0, 100, 2)];
    expect(indicators.distance_from_ma(zeroMa, 2).value).toBeNull();
    const valid = [makeCandle(100, 100, 1), makeCandle(120, 100, 2)];
    expect(indicators.distance_from_ma(valid, 2).value).toBeCloseTo((120 - 110) / 110, 5);
  });
});
