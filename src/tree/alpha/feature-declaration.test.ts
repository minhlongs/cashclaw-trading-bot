// Alpha Lab — Feature Declaration Contract Tests
//
// Phase 4 of the alpha discovery mission requires every feature to declare
// name, timeframe, source, lookback, availability, and causal. This file
// tests that contract and, more importantly, the causal gate: a non-causal
// feature must be rejected before it can reach a feature vector, a label, or
// an execution decision.

import { describe, it, expect } from 'vitest';
import { declareFeature, type FeatureDeclaration } from './indicator-types';

const VALID: FeatureDeclaration = {
  name: 'rsi',
  timeframe: '1h',
  source: 'ohlcv',
  lookback: 14,
  availability: 'always',
  causal: true,
};

describe('declareFeature', () => {
  it('accepts a fully valid declaration', () => {
    expect(declareFeature(VALID)).toEqual(VALID);
  });

  it('rejects a non-causal feature', () => {
    expect(() => declareFeature({ ...VALID, causal: false })).toThrow(/non-causal/);
  });

  it('rejects a missing name', () => {
    expect(() => declareFeature({ ...VALID, name: '' })).toThrow(/name/);
  });

  it('rejects a missing timeframe', () => {
    expect(() => declareFeature({ ...VALID, timeframe: '' })).toThrow(/timeframe/);
  });

  it('rejects a negative lookback', () => {
    expect(() => declareFeature({ ...VALID, lookback: -1 })).toThrow(/lookback/);
  });

  it('rejects a non-finite lookback', () => {
    expect(() => declareFeature({ ...VALID, lookback: Infinity })).toThrow(/lookback/);
  });

  it('rejects a missing availability', () => {
    expect(() => declareFeature({ ...VALID, availability: undefined as unknown as never })).toThrow(/availability/);
  });

  it('rejects a missing causal flag', () => {
    expect(() => declareFeature({ ...VALID, causal: undefined as unknown as boolean })).toThrow(/causal/);
  });

  it('rejects a look-ahead indicator (e.g. using the next candle close)', () => {
    // This is the exact shape of a leaky feature: it looks at candle T+1 to
    // compute the value at T. The contract must catch it before it ships.
    const leaky: FeatureDeclaration = {
      name: 'next_close',
      timeframe: '1h',
      source: 'ohlcv',
      lookback: 1,
      availability: 'always',
      causal: false,
    };
    expect(() => declareFeature(leaky)).toThrow();
  });
});