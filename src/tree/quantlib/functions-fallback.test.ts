import { describe, it, expect } from 'vitest';
import {
  gridFunctions,
  volatilityDcaFunctions,
  quantFunctionsExt,
  type QuantLibContext,
  type QuantFn,
} from './functions';

const ctx: QuantLibContext = { symbol: 'ETH/USDT', balance: 500, lastPrice: 3000 };

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

  it('returns error result when all fns in array throw or array is empty', () => {
    const original = gridFunctions[0];
    const alwaysFail: QuantFn = () => {
      throw new Error('always fail');
    };

    gridFunctions.length = 0;
    gridFunctions.push(alwaysFail, alwaysFail);
    try {
      expect(quantFunctionsExt.grid(ctx)).toEqual({
        signal: 'hold',
        confidence: 0,
        meta: { error: 'all_fallbacks_failed' },
      });
      gridFunctions.length = 0;
      expect(quantFunctionsExt.grid(ctx)).toEqual({
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

describe('volatilityDcaFunctions[0] & retryWithFallback mutation', () => {
  it('handles zero price, buy drop threshold, and sell rebound target', () => {
    expect(volatilityDcaFunctions[0]({ ...ctx, lastPrice: 0 }, { referencePrice: 3000 }).meta.reason).toBe(
      'invalid_price',
    );
    expect(volatilityDcaFunctions[0]({ ...ctx, lastPrice: 2900 }, { referencePrice: 3000 }).signal).toBe('buy');
    expect(volatilityDcaFunctions[0]({ ...ctx, lastPrice: 3200 }, { referencePrice: 3000 }).signal).toBe('sell');
  });

  it('catches thrown fn and falls back or returns all_fallbacks_failed', () => {
    const original = volatilityDcaFunctions[0];
    const throwingFn: QuantFn = () => {
      throw new Error('dca failure');
    };
    const fallbackFn: QuantFn = () => ({
      signal: 'buy',
      confidence: 0.8,
      meta: { strategy: 'dca_fallback' },
    });

    volatilityDcaFunctions.length = 0;
    volatilityDcaFunctions.push(throwingFn, fallbackFn);
    try {
      const result = quantFunctionsExt.volatility_dca(ctx, { referencePrice: 3000 });
      expect(result.signal).toBe('buy');
      expect(result.confidence).toBe(0.8);

      volatilityDcaFunctions.length = 0;
      volatilityDcaFunctions.push(throwingFn);
      expect(quantFunctionsExt.volatility_dca(ctx, { referencePrice: 3000 })).toEqual({
        signal: 'hold',
        confidence: 0,
        meta: { error: 'all_fallbacks_failed' },
      });
    } finally {
      volatilityDcaFunctions.length = 0;
      volatilityDcaFunctions.push(original);
    }
  });
});
