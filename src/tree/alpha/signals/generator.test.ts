import { describe, it, expect } from 'vitest';
import { generateDerivativeSignals } from './generator';
import type { DerivativeFeatures } from './funding';

function makeFeatures(overrides: Partial<DerivativeFeatures> = {}): DerivativeFeatures[] {
  return [{
    timestamp: 1000,
    fundingRate: null,
    fundingRateAvg8h: null,
    fundingRateSlope: null,
    openInterest: null,
    oiChange: null,
    oiZScore: null,
    liquidationImbalance: null,
    liquidationZScore: null,
    basis: null,
    basisZScore: null,
    ...overrides,
  }];
}

describe('generateDerivativeSignals', () => {
  it('produces no signals when all features are null', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    const signals = generateDerivativeSignals(candles, makeFeatures());
    expect(signals).toHaveLength(0);
  });

  it('produces short signal on extreme positive funding', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    const signals = generateDerivativeSignals(candles, makeFeatures({
      fundingRate: 0.001,
      fundingRateAvg8h: 0.0005,
      fundingRateSlope: 0.0003,
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('short');
    expect(signals[0].confidence).toBeGreaterThan(0);
  });

  it('produces long signal on extreme negative funding', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    const signals = generateDerivativeSignals(candles, makeFeatures({
      fundingRate: -0.001,
      fundingRateAvg8h: -0.0005,
      fundingRateSlope: -0.0003,
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('long');
  });

  it('produces long signal on OI surge', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    const signals = generateDerivativeSignals(candles, makeFeatures({
      oiChange: 0.15,
      oiZScore: 2.0,
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('long');
  });

  it('produces short signal on long liquidation cascade', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    const signals = generateDerivativeSignals(candles, makeFeatures({
      liquidationImbalance: 50000,
      liquidationZScore: 3.0,
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('short');
  });

  it('produces long signal on short liquidation cascade', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    const signals = generateDerivativeSignals(candles, makeFeatures({
      liquidationImbalance: -50000,
      liquidationZScore: -3.0,
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('long');
  });

  it('produces long signal on basis expansion', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    const signals = generateDerivativeSignals(candles, makeFeatures({
      basis: 0.002,
      basisZScore: 2.5,
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('long');
  });

  it('requires 1.5x vote margin for non-neutral signal', () => {
    const candles = [{ timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 } as any];
    // Funding fires SHORT (conf 0.5), OI fires LONG (conf 0.667) → within 1.5x margin → neutral
    const signals = generateDerivativeSignals(candles, makeFeatures({
      fundingRate: 0.001,
      fundingRateAvg8h: 0.0005,
      fundingRateSlope: 0.0003,
      oiChange: 0.15,
      oiZScore: 2.0,
    }));
    expect(signals.length).toBe(0);
  });
});