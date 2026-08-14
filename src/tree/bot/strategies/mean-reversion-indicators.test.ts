import { describe, it, expect } from 'vitest';
import {
  calculateBB,
  calculateRSI,
  checkVolume,
  type BollingerBands,
  type RSI,
} from './mean-reversion-indicators';

// ── calculateBB ──────────────────────────────────────────────

describe('calculateBB', () => {
  it('computes bands for a known price series', () => {
    // prices: [10, 12, 14, 16, 18], period=5, stdDev=2
    // middle = (10+12+14+16+18)/5 = 14
    // variance = ((-4)^2+(-2)^2+0+2^2+4^2)/5 = (16+4+0+4+16)/5 = 8
    // std = sqrt(8) ≈ 2.828427
    const result: BollingerBands = calculateBB([10, 12, 14, 16, 18], 5, 2);
    expect(result.middle).toBeCloseTo(14, 10);
    expect(result.upper).toBeCloseTo(14 + 2 * Math.sqrt(8), 10);
    expect(result.lower).toBeCloseTo(14 - 2 * Math.sqrt(8), 10);
  });

  it('returns upper > middle > lower with positive stdDev', () => {
    const result = calculateBB([100, 105, 110, 105, 100], 5, 1.5);
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });

  it('all values identical yields equal bands', () => {
    const result = calculateBB([50, 50, 50, 50], 4, 2);
    // std = 0 so upper = middle = lower
    expect(result.upper).toBe(50);
    expect(result.middle).toBe(50);
    expect(result.lower).toBe(50);
  });

  it('uses only the last `period` prices', () => {
    const longSeries = [1, 2, 3, 100, 100, 100];
    const result = calculateBB(longSeries, 3, 1);
    // window = [100, 100, 100], middle = 100, std = 0
    expect(result.middle).toBe(100);
    expect(result.upper).toBe(100);
    expect(result.lower).toBe(100);
  });

  it('period=1 returns the single price as all bands', () => {
    const result = calculateBB([42], 1, 3);
    expect(result.middle).toBe(42);
    expect(result.upper).toBe(42);
    expect(result.lower).toBe(42);
  });
});

// ── calculateRSI ─────────────────────────────────────────────

describe('calculateRSI', () => {
  it('returns neutral {50, neutral} when insufficient data', () => {
    // need at least period+1 prices; providing only period
    const result: RSI = calculateRSI([10, 11, 12], 3, 30, 70);
    expect(result.value).toBe(50);
    expect(result.trend).toBe('neutral');
  });

  it('returns 100 overbought when all changes are gains (avgLoss = 0)', () => {
    // monotonically increasing: every change > 0
    const result = calculateRSI([10, 20, 30, 40, 50], 4, 30, 70);
    expect(result.value).toBe(100);
    expect(result.trend).toBe('overbought');
  });

  it('detects oversold trend when RSI <= buyThreshold', () => {
    // monotonically decreasing: every change < 0 → all losses
    // avgGain = 0 → rs = 0 → rsi = 0
    const result = calculateRSI([50, 45, 40, 35, 30], 4, 30, 70);
    expect(result.value).toBe(0);
    expect(result.trend).toBe('oversold');
  });

  it('returns neutral for mixed changes landing between thresholds', () => {
    // [100, 105, 103, 106, 104, 107, 105] period=6
    // changes from index 1..6: +5, -2, +3, -2, +3, -2
    // gains: 5+3+3 = 11, losses: 2+2+2 = 6
    // avgGain = 11/6, avgLoss = 6/6 = 1
    // rs = 11/6, rsi = 100 - 100/(1+11/6) = 100 - 600/17 ≈ 64.7
    const result = calculateRSI(
      [100, 105, 103, 106, 104, 107, 105],
      6, 30, 70,
    );
    expect(result.value).toBeGreaterThan(30);
    expect(result.value).toBeLessThan(70);
    expect(result.trend).toBe('neutral');
  });

  it('detects overbought trend when RSI >= sellThreshold', () => {
    // mostly gains → RSI well above 70
    // [10, 20, 30, 35, 40, 45, 50] period=6
    // changes: +10, +10, +5, +5, +5, +5  all gains = 40, losses = 0
    // → 100 / overbought
    const result = calculateRSI([10, 20, 30, 35, 40, 45, 50], 6, 30, 70);
    expect(result.value).toBe(100);
    expect(result.trend).toBe('overbought');
  });

  it('handles a single loss correctly', () => {
    // [100, 95, 100, 105, 110, 115, 120] period=6
    // changes from idx 1..6: -5, +5, +5, +5, +5, +5
    // gains: 5+5+5+5+5 = 25, losses: 5
    // avgGain = 25/6 ≈ 4.167, avgLoss = 5/6 ≈ 0.833
    // rs = 25/5 = 5, rsi = 100 - 100/6 ≈ 83.33
    const result = calculateRSI([100, 95, 100, 105, 110, 115, 120], 6, 30, 70);
    expect(result.value).toBeCloseTo(83.33, 1);
    expect(result.trend).toBe('overbought');
  });
});

// ── checkVolume ──────────────────────────────────────────────

describe('checkVolume', () => {
  it('returns false when volumes array is shorter than period', () => {
    expect(checkVolume([100, 200], 5, 1.5)).toBe(false);
  });

  it('returns true when recent volume meets multiplier threshold', () => {
    // avg of [100,100,100,100] = 100, last=200, multiplier=1.5 → 200 >= 150
    expect(checkVolume([100, 100, 100, 100, 200], 4, 1.5)).toBe(true);
  });

  it('returns false when recent volume is below multiplier threshold', () => {
    // avg of [100,100,100,100] = 100, last=120, multiplier=1.5 → 120 < 150
    expect(checkVolume([100, 100, 100, 100, 120], 4, 1.5)).toBe(false);
  });

  it('returns true at exact equality', () => {
    // avg of [100,200,300] = 200, last=300, multiplier=1.5 → 300 == 300
    expect(checkVolume([100, 200, 300], 3, 1.5)).toBe(true);
  });

  it('returns true when multiplier is 1 and volume equals average', () => {
    expect(checkVolume([50, 50, 50], 3, 1)).toBe(true);
  });

  it('returns false when multiplier is 1 and volume is below average', () => {
    // avg of [100,100,100] = 100, last=99, multiplier=1 → 99 < 100
    expect(checkVolume([100, 100, 100, 99], 3, 1)).toBe(false);
  });

  it('handles period equal to array length', () => {
    // avg of [10,20,30] = 20, last=30, multiplier=1 → 30 >= 20
    expect(checkVolume([10, 20, 30], 3, 1)).toBe(true);
  });
});
