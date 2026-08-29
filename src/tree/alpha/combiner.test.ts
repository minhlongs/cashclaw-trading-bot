import { describe, it, expect } from 'vitest';
import type { AlphaSignal, AlphaCombinerConfig, AlphaDirection } from './types';
import { combineSignals } from './combiner';

function make(name: string, direction: AlphaDirection, confidence: number): AlphaSignal {
  return {
    name,
    source: 'indicator',
    direction,
    confidence,
    timestamp: Date.now(),
    features: { features: [], computedAt: Date.now(), symbol: 'BTC/USDT', lookback: 14 },
    metadata: {},
  };
}

const baseCfg: AlphaCombinerConfig = {
  method: 'weighted_sum',
  weights: { rsi: 0.7, macd: 0.3 },
  minConfidence: 0.2,
  symbols: ['BTC/USDT'],
};

describe('combineSignals', () => {
  // weighted_sum
  it('weighted_sum with 2 signals same direction picks that direction', () => {
    const signals = [make('rsi', 'buy', 0.6), make('macd', 'buy', 0.8)];
    const result = combineSignals(signals, baseCfg);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('buy');
  });

  it('weighted_sum with conflicting signals that cancel out → null', () => {
    // Empty weights → both use signal confidence=1, so buy*1 + sell*1 = 0
    const cfg: AlphaCombinerConfig = { ...baseCfg, weights: {} };
    const signals = [make('rsi', 'buy', 1), make('macd', 'sell', 1)];
    const result = combineSignals(signals, cfg);
    expect(result).toBeNull();
  });

  // voting
  it('voting majority long picks long', () => {
    const cfg: AlphaCombinerConfig = { ...baseCfg, method: 'voting', weights: {} };
    const signals = [make('a', 'buy', 0.5), make('b', 'buy', 0.3), make('c', 'sell', 0.4)];
    const result = combineSignals(signals, cfg);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('buy');
  });

  it('voting tie → null', () => {
    const cfg: AlphaCombinerConfig = { ...baseCfg, method: 'voting', weights: {} };
    const signals = [make('a', 'buy', 0.5), make('b', 'sell', 0.5)];
    const result = combineSignals(signals, cfg);
    expect(result).toBeNull();
  });

  // max_confidence
  it('max_confidence picks highest-confidence non-hold signal', () => {
    const cfg: AlphaCombinerConfig = { ...baseCfg, method: 'max_confidence' };
    const signals = [make('a', 'buy', 0.3), make('b', 'sell', 0.7), make('c', 'buy', 0.4)];
    const result = combineSignals(signals, cfg);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('sell');
  });

  // edge cases
  it('empty signals → null', () => {
    const result = combineSignals([], baseCfg);
    expect(result).toBeNull();
  });

  it('single signal → passthrough', () => {
    // Empty weights → signal uses its own confidence as weight
    const cfg: AlphaCombinerConfig = { ...baseCfg, weights: {} };
    const signals = [make('rsi', 'buy', 0.55)];
    const result = combineSignals(signals, cfg);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('buy');
    expect(result!.confidence).toBeCloseTo(0.55, 1);
    expect(result!.metadata.contributingNames).toEqual(['rsi']);
  });

  it('signal below minConfidence → null', () => {
    // Use signal name not in config weights → falls back to confidence=0.1
    const cfg: AlphaCombinerConfig = { ...baseCfg, weights: {}, minConfidence: 0.5 };
    const signals = [make('unknown', 'buy', 0.1)];
    expect(combineSignals(signals, cfg)).toBeNull();
  });

  it('weighted_sum uses config weights over signal confidence', () => {
    const cfg: AlphaCombinerConfig = { ...baseCfg, weights: { rsi: 0.9, macd: 0.1 } };
    const signals = [make('rsi', 'buy', 0.1), make('macd', 'buy', 0.9)];
    const result = combineSignals(signals, cfg);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('buy');
  });

  it('max_confidence with hold signal only → null', () => {
    const cfg: AlphaCombinerConfig = { ...baseCfg, method: 'max_confidence' };
    const signals = [make('a', 'hold', 1)];
    expect(combineSignals(signals, cfg)).toBeNull();
  });

  it('weighted_sum with net-negative weighted sum picks sell', () => {
    const cfg: AlphaCombinerConfig = { ...baseCfg, weights: {} };
    const signals = [make('rsi', 'sell', 0.8), make('macd', 'buy', 0.3)];
    const result = combineSignals(signals, cfg);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('sell');
  });

  it('weighted_sum with zero total weight → null', () => {
    // All signals carry zero weight (no config weight, zero confidence)
    // so the weighted sum never gets computed.
    const cfg: AlphaCombinerConfig = { ...baseCfg, weights: {} };
    const signals = [make('rsi', 'buy', 0)];
    expect(combineSignals(signals, cfg)).toBeNull();
  });

  it('voting majority below minConfidence → null', () => {
    // buy (0.5) beats sell (0.1) but conf = 0.5/0.6 ≈ 0.83 < 0.9.
    const cfg: AlphaCombinerConfig = { ...baseCfg, method: 'voting', weights: {}, minConfidence: 0.9 };
    const signals = [make('a', 'buy', 0.5), make('b', 'sell', 0.1)];
    expect(combineSignals(signals, cfg)).toBeNull();
  });

  it('voting with net-zero total weight yields zero confidence → null', () => {
    // Negative config weight makes the weight sum zero while one side still
    // wins the tally, exercising the division guard.
    const cfg: AlphaCombinerConfig = {
      ...baseCfg, method: 'voting', weights: { a: 0.5, b: -0.5 }, minConfidence: 0.1,
    };
    const signals = [make('a', 'buy', 1), make('b', 'sell', 1)];
    expect(combineSignals(signals, cfg)).toBeNull();
  });

  it('unknown method → null', () => {
    const cfg = { ...baseCfg, method: 'bogus' as AlphaCombinerConfig['method'] };
    expect(combineSignals([make('a', 'buy', 0.5)], cfg)).toBeNull();
  });
});