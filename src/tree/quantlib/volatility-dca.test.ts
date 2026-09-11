import { describe, it, expect } from 'vitest';
import { volatilityDca } from './volatility-dca';
import type { QuantLibContext } from './index';

const ctx: QuantLibContext = { symbol: 'BTC/USDT', balance: 1000, lastPrice: 50000 };

describe('volatilityDca — input validation', () => {
  it('returns hold on zero lastPrice', () => {
    const res = volatilityDca({ ...ctx, lastPrice: 0 }, { referencePrice: 50000 });
    expect(res).toEqual({ signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'invalid_price' } });
  });

  it('returns hold on negative lastPrice', () => {
    const res = volatilityDca({ ...ctx, lastPrice: -100 }, { referencePrice: 50000 });
    expect(res).toEqual({ signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'invalid_price' } });
  });

  it('returns hold when referencePrice is undefined or params omitted', () => {
    expect(volatilityDca(ctx)).toEqual({
      signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'no_reference_price' },
    });
    expect(volatilityDca(ctx, {})).toEqual({
      signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'no_reference_price' },
    });
  });

  it('returns hold on non-positive referencePrice', () => {
    expect(volatilityDca(ctx, { referencePrice: 0 }).meta.reason).toBe('invalid_params');
    expect(volatilityDca(ctx, { referencePrice: -500 }).meta.reason).toBe('invalid_params');
  });

  it('returns hold on non-positive priceDropStep', () => {
    expect(volatilityDca(ctx, { referencePrice: 50000, priceDropStep: 0 }).meta.reason).toBe('invalid_params');
    expect(volatilityDca(ctx, { referencePrice: 50000, priceDropStep: -0.01 }).meta.reason).toBe('invalid_params');
  });

  it('returns hold on non-positive maxSteps', () => {
    expect(volatilityDca(ctx, { referencePrice: 50000, maxSteps: 0 }).meta.reason).toBe('invalid_params');
    expect(volatilityDca(ctx, { referencePrice: 50000, maxSteps: -2 }).meta.reason).toBe('invalid_params');
  });

  it('returns hold on non-positive volBaseline', () => {
    expect(volatilityDca(ctx, { referencePrice: 50000, volBaseline: 0 }).meta.reason).toBe('invalid_params');
    expect(volatilityDca(ctx, { referencePrice: 50000, volBaseline: -0.02 }).meta.reason).toBe('invalid_params');
  });

  it('returns hold when stepIndex reached or exceeded maxSteps', () => {
    expect(volatilityDca(ctx, { referencePrice: 50000, stepIndex: 5, maxSteps: 5 }).meta.reason).toBe('max_steps_reached');
    expect(volatilityDca(ctx, { referencePrice: 50000, stepIndex: 7, maxSteps: 5 }).meta.reason).toBe('max_steps_reached');
  });
});

describe('volatilityDca — buy signals and volatility multiplier clamping', () => {
  it('emits buy with default parameters when drop matches requiredDrop', () => {
    // ref=50000, defaults: vol=0.02, volBaseline=0.02 (mult=1.0), step=0 (step 1), dropStep=0.025
    // requiredDrop = 0.025 * 1 * 1.0 = 0.025. lastPrice = 50000 * (1 - 0.025) = 48750
    const res = volatilityDca({ ...ctx, lastPrice: 48750 }, { referencePrice: 50000 });
    expect(res.signal).toBe('buy');
    expect(res.confidence).toBe(0.6667);
    expect(res.meta).toEqual({
      strategy: 'volatility_dca',
      step: 1,
      drop: 0.025,
      requiredDrop: 0.025,
      volMultiplier: 1.0,
    });
  });

  it('clamps confidence to 1.0 on large drops', () => {
    // ref=50000, price=35000 (drop=0.3), requiredDrop=0.025 -> rawConf = 0.3 / 0.0375 = 8.0 -> clamped to 1.0
    const res = volatilityDca({ ...ctx, lastPrice: 35000 }, { referencePrice: 50000 });
    expect(res.signal).toBe('buy');
    expect(res.confidence).toBe(1);
    expect(res.meta.drop).toBe(0.3);
  });

  it('clamps volatility multiplier to 2.5 when market volatility spikes', () => {
    // vol=0.10, volBaseline=0.02 -> ratio 5.0 -> clamped to 2.5
    // requiredDrop = 0.025 * 1 * 2.5 = 0.0625. price = 50000 * (1 - 0.0625) = 46875
    const res = volatilityDca(
      { ...ctx, lastPrice: 46875 },
      { referencePrice: 50000, volatility: 0.10, volBaseline: 0.02 },
    );
    expect(res.signal).toBe('buy');
    expect(res.meta.volMultiplier).toBe(2.5);
    expect(res.meta.requiredDrop).toBe(0.0625);
  });

  it('clamps volatility multiplier to 0.5 when market volatility collapses', () => {
    // vol=0.005, volBaseline=0.02 -> ratio 0.25 -> clamped to 0.5
    // requiredDrop = 0.025 * 1 * 0.5 = 0.0125. price = 50000 * (1 - 0.0125) = 49375
    const res = volatilityDca(
      { ...ctx, lastPrice: 49375 },
      { referencePrice: 50000, volatility: 0.005, volBaseline: 0.02 },
    );
    expect(res.signal).toBe('buy');
    expect(res.meta.volMultiplier).toBe(0.5);
    expect(res.meta.requiredDrop).toBe(0.0125);
  });

  it('supports advanced step index with higher required drop', () => {
    // stepIndex=2 -> step 3. dropStep=0.02, volMultiplier=1.0 -> requiredDrop = 0.02 * 3 * 1.0 = 0.06
    // price = 50000 * (1 - 0.06) = 47000
    const res = volatilityDca(
      { ...ctx, lastPrice: 47000 },
      { referencePrice: 50000, stepIndex: 2, priceDropStep: 0.02, maxSteps: 5 },
    );
    expect(res.signal).toBe('buy');
    expect(res.meta.step).toBe(3);
    expect(res.meta.requiredDrop).toBe(0.06);
  });
});

describe('volatilityDca — sell signals (profit taking rebound)', () => {
  it('emits sell when price rises to exactly reboundTarget', () => {
    // ref=50000, default reboundTarget=0.04 -> price=52000 -> drop = -0.04
    // rawConf = 0.04 / (2 * 0.04) = 0.5
    const res = volatilityDca({ ...ctx, lastPrice: 52000 }, { referencePrice: 50000 });
    expect(res.signal).toBe('sell');
    expect(res.confidence).toBe(0.5);
    expect(res.meta).toEqual({
      strategy: 'volatility_dca',
      profitRatio: 0.04,
    });
  });

  it('caps sell confidence at 1.0 on large price surges', () => {
    // ref=50000, reboundTarget=0.05, price=60000 (gain 20% -> drop = -0.20)
    // rawConf = 0.20 / (2 * 0.05) = 2.0 -> clamped to 1.0
    const res = volatilityDca(
      { ...ctx, lastPrice: 60000 },
      { referencePrice: 50000, reboundTarget: 0.05 },
    );
    expect(res.signal).toBe('sell');
    expect(res.confidence).toBe(1);
    expect(res.meta.profitRatio).toBe(0.2);
  });
});

describe('volatilityDca — hold signal', () => {
  it('emits hold when price is identical to referencePrice', () => {
    const res = volatilityDca({ ...ctx, lastPrice: 50000 }, { referencePrice: 50000 });
    expect(res.signal).toBe('hold');
    expect(res.confidence).toBe(0);
    expect(res.meta).toEqual({
      strategy: 'volatility_dca',
      drop: 0,
      requiredDrop: 0.025,
    });
  });

  it('emits hold when price drops less than requiredDrop', () => {
    // drop = 1% < requiredDrop 2.5%
    const res = volatilityDca({ ...ctx, lastPrice: 49500 }, { referencePrice: 50000 });
    expect(res.signal).toBe('hold');
    expect(res.confidence).toBe(0);
    expect(res.meta.drop).toBe(0.01);
  });

  it('emits hold when price rises less than reboundTarget', () => {
    // gain = 2% < reboundTarget 4% -> drop = -0.02
    const res = volatilityDca({ ...ctx, lastPrice: 51000 }, { referencePrice: 50000 });
    expect(res.signal).toBe('hold');
    expect(res.confidence).toBe(0);
    expect(res.meta.drop).toBe(-0.02);
  });
});
