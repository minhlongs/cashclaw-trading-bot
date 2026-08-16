import { describe, it, expect } from 'vitest';
import { quantFunctions, type QuantLibContext, type QuantResult, type QuantFn } from './index';

const ctx: QuantLibContext = { symbol: 'BTC/USDT', balance: 1000, lastPrice: 50000 };

describe('quantFunctions', () => {
  it('noop returns hold with zero confidence', () => {
    const result = quantFunctions.noop(ctx);
    expect(result).toEqual({ signal: 'hold', confidence: 0, meta: {} });
  });

  it('grid returns hold with 0.35 confidence and grid strategy', () => {
    const result = quantFunctions.grid(ctx);
    expect(result).toEqual({ signal: 'hold', confidence: 0.35, meta: { strategy: 'grid' } });
  });

  it('mean_reversion returns hold with 0.3 confidence when lastPrice > 0', () => {
    const result = quantFunctions.mean_reversion(ctx);
    expect(result).toEqual({ signal: 'hold', confidence: 0.3, meta: { strategy: 'mean_reversion' } });
  });

  it('mean_reversion returns hold with 0 confidence when lastPrice is 0', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: 0 });
    expect(result).toEqual({ signal: 'hold', confidence: 0, meta: {} });
  });

  it('mean_reversion returns hold with 0 confidence when lastPrice is negative', () => {
    const result = quantFunctions.mean_reversion({ ...ctx, lastPrice: -100 });
    expect(result).toEqual({ signal: 'hold', confidence: 0, meta: {} });
  });

  it('quantFunctions exposes exactly three keys', () => {
    expect(Object.keys(quantFunctions)).toEqual(['noop', 'grid', 'mean_reversion']);
  });

  it('all functions satisfy the QuantFn signature', () => {
    for (const fn of Object.values(quantFunctions)) {
      const result: QuantResult = fn(ctx);
      expect(['buy', 'sell', 'hold']).toContain(result.signal);
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.meta).toBe('object');
    }
  });
});
