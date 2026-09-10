import { describe, it, expect } from 'vitest';
import { quantFunctions, type QuantLibContext, type QuantResult } from './index';

const ctx: QuantLibContext = { symbol: 'BTC/USDT', balance: 1000, lastPrice: 50000 };

describe('quantFunctions.noop', () => {
  it('returns hold with zero confidence and empty meta', () => {
    expect(quantFunctions.noop(ctx)).toEqual({ signal: 'hold', confidence: 0, meta: {} });
  });

  it('ignores params', () => {
    expect(quantFunctions.noop(ctx, { anything: 99 })).toEqual({ signal: 'hold', confidence: 0, meta: {} });
  });
});

describe('quantFunctions.grid — invalid inputs', () => {
  it('returns hold when lastPrice is 0', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: 0 });
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
    expect(result.meta.reason).toBe('invalid_price');
  });

  it('returns hold when lastPrice is negative', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: -1 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_price');
  });

  it('returns hold when gridSpacing is 0', () => {
    const result = quantFunctions.grid(ctx, { gridSpacing: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_params');
  });

  it('returns hold when levels is 0', () => {
    const result = quantFunctions.grid(ctx, { levels: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_params');
  });

  it('returns hold when tolerance is 0', () => {
    const result = quantFunctions.grid(ctx, { tolerance: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_params');
  });
});

describe('quantFunctions.grid — buy signal', () => {
  it('emits buy when price is at the lower grid level (exact match)', () => {
    // anchor=50000, spacing=0.02 → first lower level = 50000 * 0.98 = 49000
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: 49000 },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThanOrEqual(0.99);
    expect(result.meta.strategy).toBe('grid');
  });

  it('emits buy when price is within tolerance of lower level', () => {
    // distToLower ≈ 0.002 which is < tolerance 0.005
    const lowerLevel = 50000 * 0.98; // 49000
    const slightlyAbove = lowerLevel * 1.002; // 49098
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: slightlyAbove },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('buy confidence is clamped to [0,1]', () => {
    // exact hit → confidence should be 1.0
    const lowerLevel = 50000 * 0.98;
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: lowerLevel },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.01 },
    );
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('emits buy when price is near deeper lower grid level (level 2)', () => {
    // anchor=50000, spacing=0.02, level 2 = 50000 * 0.96 = 48000
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: 48000 },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('buy');
    expect(result.meta.nearestLevel).toBe(48000);
  });
});

describe('quantFunctions.grid — sell signal', () => {
  it('emits sell when price is at the upper grid level (exact match)', () => {
    // anchor=50000, spacing=0.02 → first upper level = 50000 * 1.02 = 51000
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: 51000 },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('sell');
    expect(result.confidence).toBeGreaterThanOrEqual(0.99);
    expect(result.meta.strategy).toBe('grid');
  });

  it('emits sell when price is within tolerance of upper level', () => {
    const upperLevel = 50000 * 1.02;
    const slightlyBelow = upperLevel * 0.998;
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: slightlyBelow },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('sell');
  });

  it('emits sell when price is near deeper upper grid level (level 2)', () => {
    // anchor=50000, spacing=0.02, level 2 = 50000 * 1.04 = 52000
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: 52000 },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('sell');
    expect(result.meta.nearestLevel).toBe(52000);
  });

  it('emits sell when within tolerance of both levels but closer to upper level', () => {
    // anchor=50000, spacing=0.02 (lower=49000, upper=51000)
    // price=50400 -> distToLower = 1400/50400 ≈ 0.0277, distToUpper = 600/50400 ≈ 0.0119
    // tolerance=0.03 -> both are <= tolerance, but distToLower > distToUpper
    const result = quantFunctions.grid(
      { ...ctx, lastPrice: 50400 },
      { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.03 },
    );
    expect(result.signal).toBe('sell');
  });
});

describe('quantFunctions.grid — hold signal', () => {
  it('emits hold when price is mid-grid (far from any level)', () => {
    // at anchor (50000) with spacing=0.02, nearest level is 49000 or 51000 — both 1000 away = 2% = tolerance 0.005 not met
    const result = quantFunctions.grid(ctx, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
    expect(result.meta.nearestLower).toBeDefined();
    expect(result.meta.nearestUpper).toBeDefined();
  });

  it('uses lastPrice as default anchor when anchor param is omitted', () => {
    // With lastPrice as anchor, distance to nearest level = spacing (2%) >> default tolerance (0.5%)
    const result = quantFunctions.grid(ctx);
    expect(result.signal).toBe('hold');
  });
});

describe('quantFunctions.mean_reversion — invalid inputs', () => {
  it('returns hold with no_fair_value reason when fairValue is undefined', () => {
    const result = quantFunctions.mean_reversion(ctx);
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('no_fair_value');
  });

  it('returns hold with no_fair_value reason when fairValue is 0', () => {
    const result = quantFunctions.mean_reversion(ctx, { fairValue: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('no_fair_value');
  });

  it('returns hold when lastPrice is 0', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 0 }, { fairValue: 50000 });
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
  });

  it('returns hold when lastPrice is negative', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: -1 }, { fairValue: 50000 });
    expect(result.signal).toBe('hold');
  });

  it('returns hold when threshold is 0', () => {
    const result = quantFunctions.mean_reversion(ctx, { fairValue: 50000, threshold: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_threshold');
  });
});

describe('quantFunctions.mean_reversion — buy signal', () => {
  it('emits buy when price is below fair value by more than threshold', () => {
    // fairValue=50000, threshold=0.015 → price < 49250 triggers buy
    const result = quantFunctions.mean_reversion(
      { ...ctx, lastPrice: 48000 },
      { fairValue: 50000, threshold: 0.015 },
    );
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.meta.strategy).toBe('mean_reversion');
    expect(result.meta.deviation).toBeLessThan(0);
  });

  it('buy confidence scales with deviation up to maxConf', () => {
    // deviation=-0.03 threshold=0.015 → strength=min(1,0.03/0.03)=1.0 → confidence=maxConf=0.8
    const result = quantFunctions.mean_reversion(
      { ...ctx, lastPrice: 48500 },
      { fairValue: 50000, threshold: 0.015, maxConf: 0.8 },
    );
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeLessThanOrEqual(0.8);
  });
});

describe('quantFunctions.mean_reversion — sell signal', () => {
  it('emits sell when price is above fair value by more than threshold', () => {
    // fairValue=50000, threshold=0.015 → price > 50750 triggers sell
    const result = quantFunctions.mean_reversion(
      { ...ctx, lastPrice: 52000 },
      { fairValue: 50000, threshold: 0.015 },
    );
    expect(result.signal).toBe('sell');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.meta.deviation).toBeGreaterThan(0);
  });

  it('sell confidence is capped at maxConf', () => {
    // deviation=+0.1 >> 2*threshold=0.03 → strength=1.0 → confidence=maxConf
    const result = quantFunctions.mean_reversion(
      { ...ctx, lastPrice: 55000 },
      { fairValue: 50000, threshold: 0.015, maxConf: 0.75 },
    );
    expect(result.signal).toBe('sell');
    expect(result.confidence).toBeLessThanOrEqual(0.75);
  });
});

describe('quantFunctions.mean_reversion — hold signal', () => {
  it('emits hold when price is within threshold of fair value', () => {
    // deviation = 0.005, threshold = 0.015 → hold
    const result = quantFunctions.mean_reversion(
      { ...ctx, lastPrice: 50250 },
      { fairValue: 50000, threshold: 0.015 },
    );
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
    expect(result.meta.fairValue).toBe(50000);
  });
});

describe('quantFunctions key contract', () => {
  it('exposes exactly three keys', () => {
    expect(Object.keys(quantFunctions)).toEqual(['noop', 'grid', 'mean_reversion']);
  });

  it('all functions satisfy QuantFn return shape', () => {
    const params = { fairValue: 50000, anchor: 50000 };
    for (const fn of Object.values(quantFunctions)) {
      const result: QuantResult = fn(ctx, params);
      expect(['buy', 'sell', 'hold']).toContain(result.signal);
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.meta).toBe('object');
    }
  });
});
