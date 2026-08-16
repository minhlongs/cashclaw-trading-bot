import { describe, it, expect } from 'vitest';
import {
  gridFunctions,
  meanReversionFunctions,
  quantFunctionsExt,
  type QuantLibContext,
  type QuantFn,
} from './functions';

const ctx: QuantLibContext = { symbol: 'ETH/USDT', balance: 500, lastPrice: 3000 };

describe('gridFunctions', () => {
  it('returns buy signal with grid strategy and symbol in meta', () => {
    const result = gridFunctions[0](ctx);
    expect(result).toEqual({
      signal: 'buy',
      confidence: 0.5,
      meta: { strategy: 'grid', symbol: 'ETH/USDT' },
    });
  });
});

describe('meanReversionFunctions', () => {
  it('returns hold with strategy when lastPrice > 0', () => {
    const result = meanReversionFunctions[0](ctx);
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0.3);
    expect(result.meta).toEqual({
      strategy: 'mean_reversion',
      symbol: 'ETH/USDT',
    });
  });

  it('returns hold with 0 confidence when lastPrice is 0', () => {
    const result = meanReversionFunctions[0]({ ...ctx, lastPrice: 0 });
    expect(result).toEqual({ signal: 'hold', confidence: 0, meta: {} });
  });

  it('returns hold with 0 confidence when lastPrice is negative', () => {
    const result = meanReversionFunctions[0]({ ...ctx, lastPrice: -5 });
    expect(result).toEqual({ signal: 'hold', confidence: 0, meta: {} });
  });
});

describe('quantFunctionsExt', () => {
  it('grid delegates through retryWithFallback to gridFunctions', () => {
    const result = quantFunctionsExt.grid(ctx);
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBe(0.5);
  });

  it('mean_reversion delegates through retryWithFallback', () => {
    const result = quantFunctionsExt.mean_reversion(ctx);
    expect(result.signal).toBe('hold');
    expect(result.confidence).toBe(0.3);
  });

  it('fallback returns hold with reason', () => {
    const result = quantFunctionsExt.fallback(ctx);
    expect(result).toEqual({ signal: 'hold', confidence: 0, meta: { reason: 'fallback' } });
  });

  it('regular delegates to grid', () => {
    const result = quantFunctionsExt.regular(ctx);
    expect(result.signal).toBe('buy');
    expect(result.confidence).toBe(0.5);
  });
});

describe('retryWithFallback internal behavior via gridFunctions mutation', () => {
  it('catches thrown fn and falls back to next fn', () => {
    // Save original and replace with a throwing fn followed by a success fn
    const original = gridFunctions[0];
    const throwingFn: QuantFn = () => {
      throw new Error('intentional failure');
    };
    const successFn: QuantFn = () => ({
      signal: 'sell',
      confidence: 0.9,
      meta: { strategy: 'recovery' },
    });

    // gridFunctions is a mutable array, so we can push/pop for testing
    gridFunctions.length = 0;
    gridFunctions.push(throwingFn, successFn);

    try {
      const result = quantFunctionsExt.grid(ctx);
      expect(result.signal).toBe('sell');
      expect(result.confidence).toBe(0.9);
      expect(result.meta).toEqual({ strategy: 'recovery' });
    } finally {
      // Restore original
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
