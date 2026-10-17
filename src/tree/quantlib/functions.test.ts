import { describe, it, expect } from 'vitest';
import {
  gridFunctions,
  meanReversionFunctions,
  quantFunctionsExt,
  type QuantLibContext,
} from './functions';

const ctx: QuantLibContext = { symbol: 'ETH/USDT', balance: 500, lastPrice: 3000 };

describe('gridFunctions[0]', () => {
  it('returns hold on zero or negative price or invalid params', () => {
    expect(gridFunctions[0]({ ...ctx, lastPrice: 0 }).meta.reason).toBe('invalid_price');
    expect(gridFunctions[0]({ ...ctx, lastPrice: -10 }).meta.reason).toBe('invalid_price');
    expect(gridFunctions[0](ctx, { gridSpacing: -0.01 }).meta.reason).toBe('invalid_params');
    expect(gridFunctions[0](ctx, { levels: 0 }).meta.reason).toBe('invalid_params');
    expect(gridFunctions[0](ctx, { tolerance: -1 }).meta.reason).toBe('invalid_params');
  });

  it('emits buy when near lower grid level (level 1 and level 2)', () => {
    const r1 = gridFunctions[0](
      { ...ctx, lastPrice: 2940 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(r1.signal).toBe('buy');
    expect(r1.confidence).toBeGreaterThan(0.9);

    const r2 = gridFunctions[0](
      { ...ctx, lastPrice: 2880 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(r2.signal).toBe('buy');
    expect(r2.meta.nearestLevel).toBe(2880);
  });

  it('emits sell when near upper grid level (level 1, level 2, or closer to upper)', () => {
    const r1 = gridFunctions[0](
      { ...ctx, lastPrice: 3060 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(r1.signal).toBe('sell');

    const r2 = gridFunctions[0](
      { ...ctx, lastPrice: 3120 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(r2.signal).toBe('sell');
    expect(r2.meta.nearestLevel).toBe(3120);

    const rCloser = gridFunctions[0](
      { ...ctx, lastPrice: 3020 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.03 },
    );
    expect(rCloser.signal).toBe('sell');
  });

  it('emits hold when mid-grid or when anchor defaults to lastPrice', () => {
    const mid = gridFunctions[0](ctx, { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(mid.signal).toBe('hold');
    expect(mid.confidence).toBe(0);
    expect(gridFunctions[0](ctx).signal).toBe('hold');
  });
});

describe('meanReversionFunctions[0]', () => {
  it('returns hold on invalid price, missing/zero fairValue, or zero threshold', () => {
    expect(meanReversionFunctions[0]({ ...ctx, lastPrice: 0 }).signal).toBe('hold');
    expect(meanReversionFunctions[0]({ ...ctx, lastPrice: -5 }).signal).toBe('hold');
    expect(meanReversionFunctions[0](ctx).meta.reason).toBe('no_fair_value');
    expect(meanReversionFunctions[0](ctx, { fairValue: 0 }).meta.reason).toBe('no_fair_value');
    expect(meanReversionFunctions[0](ctx, { fairValue: 3000, threshold: 0 }).meta.reason).toBe('invalid_threshold');
  });

  it('emits buy, sell, or hold relative to fairValue threshold', () => {
    const buy = meanReversionFunctions[0]({ ...ctx, lastPrice: 2900 }, { fairValue: 3000, threshold: 0.015 });
    expect(buy.signal).toBe('buy');
    expect(buy.confidence).toBeGreaterThan(0);

    const sell = meanReversionFunctions[0]({ ...ctx, lastPrice: 3100 }, { fairValue: 3000, threshold: 0.015 });
    expect(sell.signal).toBe('sell');
    expect(sell.confidence).toBeGreaterThan(0);

    const hold = meanReversionFunctions[0]({ ...ctx, lastPrice: 3010 }, { fairValue: 3000, threshold: 0.015 });
    expect(hold.signal).toBe('hold');
    expect(hold.confidence).toBe(0);
  });
});

describe('quantFunctionsExt', () => {
  it('delegates grid, mean_reversion, volatility_dca, fallback, and regular', () => {
    expect(
      quantFunctionsExt.grid({ ...ctx, lastPrice: 2940 }, { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 }).signal,
    ).toBe('buy');

    expect(
      quantFunctionsExt.mean_reversion({ ...ctx, lastPrice: 2900 }, { fairValue: 3000, threshold: 0.015 }).signal,
    ).toBe('buy');

    expect(quantFunctionsExt.volatility_dca({ ...ctx, lastPrice: 2900 }, { referencePrice: 3000 }).signal).toBe('buy');
    expect(quantFunctionsExt.volatility_dca({ ...ctx, lastPrice: 3200 }, { referencePrice: 3000 }).signal).toBe('sell');
    expect(quantFunctionsExt.volatility_dca({ ...ctx, lastPrice: 3000 }, { referencePrice: 3000 }).signal).toBe('hold');

    expect(quantFunctionsExt.fallback(ctx)).toEqual({ signal: 'hold', confidence: 0, meta: { reason: 'fallback' } });
    expect(
      quantFunctionsExt.regular({ ...ctx, lastPrice: 2940 }, { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 }).signal,
    ).toBe('buy');
  });
});
