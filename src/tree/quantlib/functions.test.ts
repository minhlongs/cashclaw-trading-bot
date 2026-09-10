import { describe, it, expect } from 'vitest';
import {
  gridFunctions,
  meanReversionFunctions,
  quantFunctionsExt,
  type QuantLibContext,
  type QuantFn,
} from './functions';

const ctx: QuantLibContext = { symbol: 'ETH/USDT', balance: 500, lastPrice: 3000 };

describe('gridFunctions[0]', () => {
  it('returns hold on zero price', () => {
    const result = gridFunctions[0]({ ...ctx, lastPrice: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_price');
  });

  it('returns hold on negative price', () => {
    const result = gridFunctions[0]({ ...ctx, lastPrice: -10 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_price');
  });

  it('returns hold on invalid params', () => {
    expect(gridFunctions[0](ctx, { gridSpacing: -0.01 }).meta.reason).toBe('invalid_params');
    expect(gridFunctions[0](ctx, { levels: 0 }).meta.reason).toBe('invalid_params');
    expect(gridFunctions[0](ctx, { tolerance: -1 }).meta.reason).toBe('invalid_params');
  });

  it('emits buy when near lower grid level', () => {
    // anchor=3000, spacing=0.02 → first lower level = 2940
    const result = gridFunctions[0](
      { ...ctx, lastPrice: 2940 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('emits sell when near upper grid level', () => {
    // anchor=3000, spacing=0.02 → first upper level = 3060
    const result = gridFunctions[0](
      { ...ctx, lastPrice: 3060 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('sell');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('emits hold when mid-grid', () => {
    const result = gridFunctions[0](ctx, { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 });
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
  });

  it('defaults anchor to lastPrice when anchor not supplied', () => {
    const result = gridFunctions[0](ctx);
    expect(result.signal).toBe('hold');
  });
});

describe('meanReversionFunctions[0]', () => {
  it('returns hold when lastPrice is zero', () => {
    const result = meanReversionFunctions[0]({ ...ctx, lastPrice: 0 });
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
  });

  it('returns hold when lastPrice is negative', () => {
    const result = meanReversionFunctions[0]({ ...ctx, lastPrice: -5 });
    expect(result.signal).toBe('hold');
  });

  it('returns hold with no_fair_value when fairValue is missing', () => {
    const result = meanReversionFunctions[0](ctx);
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('no_fair_value');
  });

  it('returns hold with no_fair_value when fairValue is 0', () => {
    const result = meanReversionFunctions[0](ctx, { fairValue: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('no_fair_value');
  });

  it('returns hold with invalid_threshold when threshold is 0', () => {
    const result = meanReversionFunctions[0](ctx, { fairValue: 3000, threshold: 0 });
    expect(result.signal).toBe('hold');
    expect(result.meta.reason).toBe('invalid_threshold');
  });

  it('emits buy when price is below fair value by more than threshold', () => {
    // fairValue=3000, threshold=0.015 → buy triggered below 2955
    const result = meanReversionFunctions[0](
      { ...ctx, lastPrice: 2900 },
      { fairValue: 3000, threshold: 0.015 },
    );
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('emits sell when price is above fair value by more than threshold', () => {
    const result = meanReversionFunctions[0](
      { ...ctx, lastPrice: 3100 },
      { fairValue: 3000, threshold: 0.015 },
    );
    expect(result.signal).toBe('sell');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('emits hold when price is within threshold', () => {
    const result = meanReversionFunctions[0](
      { ...ctx, lastPrice: 3010 },
      { fairValue: 3000, threshold: 0.015 },
    );
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0);
  });
});

describe('quantFunctionsExt', () => {
  it('grid delegates through retryWithFallback with params', () => {
    const result = quantFunctionsExt.grid(
      { ...ctx, lastPrice: 2940 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('buy');
  });

  it('mean_reversion delegates through retryWithFallback with params', () => {
    const result = quantFunctionsExt.mean_reversion(
      { ...ctx, lastPrice: 2900 },
      { fairValue: 3000, threshold: 0.015 },
    );
    expect(result.signal).toBe('buy');
  });

  it('fallback returns hold with reason', () => {
    const result = quantFunctionsExt.fallback(ctx);
    expect(result).toEqual({ signal: 'hold', confidence: 0, meta: { reason: 'fallback' } });
  });

  it('regular delegates to grid', () => {
    const result = quantFunctionsExt.regular(
      { ...ctx, lastPrice: 2940 },
      { anchor: 3000, gridSpacing: 0.02, levels: 5, tolerance: 0.005 },
    );
    expect(result.signal).toBe('buy');
  });
});

describe('retryWithFallback internal behavior via gridFunctions mutation', () => {
  it('catches thrown fn and falls back to next fn', () => {
    const original = gridFunctions[0];
    const throwingFn: QuantFn = () => {
      throw new Error('intentional failure');
    };
    const successFn: QuantFn = () => ({
      signal: 'sell',
      confidence: 0.9,
      meta: { strategy: 'recovery' },
    });

    gridFunctions.length = 0;
    gridFunctions.push(throwingFn, successFn);

    try {
      const result = quantFunctionsExt.grid(ctx);
      expect(result.signal).toBe('sell');
      expect(result.confidence).toBe(0.9);
      expect(result.meta).toEqual({ strategy: 'recovery' });
    } finally {
      gridFunctions.length = 0;
      gridFunctions.push(original);
    }
  });

  it('returns error result when all fns in array throw', () => {
    const original = gridFunctions[0];
    const alwaysFail: QuantFn = () => {
      throw new Error('always fail');
    };

    gridFunctions.length = 0;
    gridFunctions.push(alwaysFail, alwaysFail);

    try {
      const result = quantFunctionsExt.grid(ctx);
      expect(result).toEqual({
        signal: 'hold',
        confidence: 0,
        meta: { error: 'all_fallbacks_failed' },
      });
    } finally {
      gridFunctions.length = 0;
      gridFunctions.push(original);
    }
  });

  it('returns error result when fns array is empty', () => {
    const original = gridFunctions[0];
    gridFunctions.length = 0;

    try {
      const result = quantFunctionsExt.grid(ctx);
      expect(result).toEqual({
        signal: 'hold',
        confidence: 0,
        meta: { error: 'all_fallbacks_failed' },
      });
    } finally {
      gridFunctions.length = 0;
      gridFunctions.push(original);
    }
  });
});
