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
    expect(result.signal).toBe('hold'); expect(result.confidence).toBe(0); expect(result.meta.reason).toBe('invalid_price');
  });
  it('returns hold when lastPrice is negative', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: -1 });
    expect(result.signal).toBe('hold'); expect(result.meta.reason).toBe('invalid_price');
  });
  it('returns hold when gridSpacing is 0', () => {
    const result = quantFunctions.grid(ctx, { gridSpacing: 0 });
    expect(result.signal).toBe('hold'); expect(result.meta.reason).toBe('invalid_params');
  });
  it('returns hold when levels is 0', () => {
    const result = quantFunctions.grid(ctx, { levels: 0 });
    expect(result.signal).toBe('hold'); expect(result.meta.reason).toBe('invalid_params');
  });
  it('returns hold when tolerance is 0', () => {
    const result = quantFunctions.grid(ctx, { tolerance: 0 });
    expect(result.signal).toBe('hold'); expect(result.meta.reason).toBe('invalid_params');
  });
});

describe('quantFunctions.grid — buy signal', () => {
  it('emits buy when price is at the lower grid level (exact match)', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: 49000 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThanOrEqual(0.99);
    expect(result.meta.strategy).toBe('grid');
  });

  it('emits buy when price is within tolerance of lower level', () => {
    const lowerLevel = 50000 * 0.98;
    const result = quantFunctions.grid({ ...ctx, lastPrice: lowerLevel * 1.002 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('buy confidence is clamped to [0,1]', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: 50000 * 0.98 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.01 });
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('emits buy when price is near deeper lower grid level (level 2)', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: 48000 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('buy');
    expect(result.meta.nearestLevel).toBe(48000);
  });
});

describe('quantFunctions.grid — sell signal', () => {
  it('emits sell when price is at the upper grid level (exact match)', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: 51000 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('sell');
    expect(result.confidence).toBeGreaterThanOrEqual(0.99);
    expect(result.meta.strategy).toBe('grid');
  });

  it('emits sell when price is within tolerance of upper level', () => {
    const upperLevel = 50000 * 1.02;
    const result = quantFunctions.grid({ ...ctx, lastPrice: upperLevel * 0.998 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('sell');
  });

  it('emits sell when price is near deeper upper grid level (level 2)', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: 52000 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('sell');
    expect(result.meta.nearestLevel).toBe(52000);
  });

  it('emits sell when within tolerance of both levels but closer to upper level', () => {
    const result = quantFunctions.grid({ ...ctx, lastPrice: 50400 }, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.03 });
    expect(result.signal).toBe('sell');
  });
});

describe('quantFunctions.grid — hold signal', () => {
  it('emits hold when price is mid-grid (far from any level)', () => {
    const result = quantFunctions.grid(ctx, { anchor: 50000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
    expect(result.meta.nearestLower).toBeDefined();
    expect(result.meta.nearestUpper).toBeDefined();
  });

  it('uses lastPrice as default anchor when anchor param is omitted', () => {
    expect(quantFunctions.grid(ctx).signal).toBe('hold');
  });
});

describe('quantFunctions.mean_reversion — invalid inputs', () => {
  it('returns hold with no_fair_value reason when fairValue is undefined', () => {
    const result = quantFunctions.mean_reversion(ctx);
    expect(result.signal).toBe('hold'); expect(result.meta.reason).toBe('no_fair_value');
  });
  it('returns hold with no_fair_value reason when fairValue is 0', () => {
    const result = quantFunctions.mean_reversion(ctx, { fairValue: 0 });
    expect(result.signal).toBe('hold'); expect(result.meta.reason).toBe('no_fair_value');
  });
  it('returns hold when lastPrice is 0', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 0 }, { fairValue: 50000 });
    expect(result.signal).toBe('hold'); expect(result.confidence).toBe(0);
  });
  it('returns hold when lastPrice is negative', () => {
    expect(quantFunctions.mean_reversion({ ...ctx, lastPrice: -1 }, { fairValue: 50000 }).signal).toBe('hold');
  });
  it('returns hold when threshold is 0', () => {
    const result = quantFunctions.mean_reversion(ctx, { fairValue: 50000, threshold: 0 });
    expect(result.signal).toBe('hold'); expect(result.meta.reason).toBe('invalid_threshold');
  });
});

describe('quantFunctions.mean_reversion — buy signal', () => {
  it('emits buy when price is below fair value by more than threshold', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 48000 }, { fairValue: 50000, threshold: 0.015 });
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.meta.strategy).toBe('mean_reversion');
    expect(result.meta.deviation).toBeLessThan(0);
  });
  it('buy confidence scales with deviation up to maxConf', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 48500 }, { fairValue: 50000, threshold: 0.015, maxConf: 0.8 });
    expect(result.signal).toBe('buy'); expect(result.confidence).toBeLessThanOrEqual(0.8);
  });
});

describe('quantFunctions.mean_reversion — sell signal', () => {
  it('emits sell when price is above fair value by more than threshold', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 52000 }, { fairValue: 50000, threshold: 0.015 });
    expect(result.signal).toBe('sell');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.meta.deviation).toBeGreaterThan(0);
  });
  it('sell confidence is capped at maxConf', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 55000 }, { fairValue: 50000, threshold: 0.015, maxConf: 0.75 });
    expect(result.signal).toBe('sell'); expect(result.confidence).toBeLessThanOrEqual(0.75);
  });
});

describe('quantFunctions.mean_reversion — hold signal', () => {
  it('emits hold when price is within threshold of fair value', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 50250 }, { fairValue: 50000, threshold: 0.015 });
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
    expect(result.meta.fairValue).toBe(50000);
  });
});

describe('quantFunctions.volatility_dca', () => {
  it('is wired to volatilityDca strategy function', () => {
    expect(quantFunctions.volatility_dca).toBeDefined();
    const result = quantFunctions.volatility_dca(ctx, { referencePrice: 50000 });
    expect(result.signal).toBe('hold');
    expect(result.meta.strategy).toBe('volatility_dca');
  });

  it('generates buy and sell signals through registry mapping', () => {
    const buyRes = quantFunctions.volatility_dca({ ...ctx, lastPrice: 48000 }, { referencePrice: 50000 });
    expect(buyRes.signal).toBe('buy');
    const sellRes = quantFunctions.volatility_dca({ ...ctx, lastPrice: 53000 }, { referencePrice: 50000 });
    expect(sellRes.signal).toBe('sell');
  });
});

describe('quantFunctions key contract', () => {
  it('exposes exactly four keys', () => {
    expect(Object.keys(quantFunctions)).toEqual(['noop', 'grid', 'mean_reversion', 'volatility_dca']);
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
