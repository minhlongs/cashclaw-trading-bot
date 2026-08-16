import { describe, it, expect } from 'vitest';
import type { AlphaSignal, AlphaDirection } from '../types';
import { RegimeLabel } from '../../regime/types';
import type { OptimizerConfig } from './types';
import { computeRegimeMultiplier, optimizePortfolio } from './optimizer';

function makeSignal(
  name: string,
  direction: AlphaDirection,
  confidence: number,
  symbol: string,
): AlphaSignal {
  return {
    name,
    source: 'indicator',
    direction,
    confidence,
    timestamp: Date.now(),
    features: {
      features: [],
      computedAt: Date.now(),
      symbol,
      lookback: 14,
    },
    metadata: {},
  };
}

function baseConfig(overrides: Partial<OptimizerConfig> = {}): OptimizerConfig {
  return {
    method: 'equal_weight',
    maxExposurePct: 1.0,
    minConfidence: 0,
    cashReservePct: 0,
    maxPositions: 10,
    ...overrides,
  };
}

const signals: AlphaSignal[] = [
  makeSignal('rsi', 'buy', 0.8, 'BTC/USDT'),
  makeSignal('macd', 'sell', 0.6, 'ETH/USDT'),
  makeSignal('bb', 'buy', 0.4, 'SOL/USDT'),
];

describe('computeRegimeMultiplier', () => {
  const cases: [RegimeLabel, number][] = [
    [RegimeLabel.TREND_UP, 1.2],
    [RegimeLabel.TREND_DOWN, 0.8],
    [RegimeLabel.RANGE, 1.0],
    [RegimeLabel.LOW_VOLATILITY, 1.1],
    [RegimeLabel.HIGH_VOLATILITY, 0.6],
    [RegimeLabel.SHOCK, 0.3],
    [RegimeLabel.UNKNOWN, 0.5],
  ];
  it.each(cases)('%s returns %s', (regime, expected) => {
    expect(computeRegimeMultiplier(regime)).toBe(expected);
  });
});

describe('equal_weight allocation', () => {
  it('divides capital equally among qualified signals', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig());
    expect(result.allocations).toHaveLength(3);
    const weights = result.allocations.map((a) => a.weight);
    expect(weights[0]).toBeCloseTo(weights[1], 4);
    expect(weights[1]).toBeCloseTo(weights[2], 4);
  });

  it('weights sum to totalExposure', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig());
    const sum = result.allocations.reduce((s, a) => s + a.weight, 0);
    expect(sum).toBeCloseTo(result.totalExposure, 6);
  });
});

// ── Confidence Weighted ──────────────────────────────────────────────────────

describe('confidence_weighted allocation', () => {
  it('assigns higher weight to higher confidence signals', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ method: 'confidence_weighted' }));
    expect(result.allocations).toHaveLength(3);
    const btcAlloc = result.allocations.find((a) => a.symbol === 'BTC/USDT')!;
    const solAlloc = result.allocations.find((a) => a.symbol === 'SOL/USDT')!;
    expect(btcAlloc.weight).toBeGreaterThan(solAlloc.weight);
  });
});

// ── Risk Parity ──────────────────────────────────────────────────────────────

describe('risk_parity allocation', () => {
  it('gives more weight to lower-risk (higher confidence) signals', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ method: 'risk_parity' }));
    expect(result.allocations).toHaveLength(3);
    const btcAlloc = result.allocations.find((a) => a.symbol === 'BTC/USDT')!;
    const solAlloc = result.allocations.find((a) => a.symbol === 'SOL/USDT')!;
    expect(btcAlloc.weight).toBeGreaterThan(solAlloc.weight);
  });
});

// ── Regime Sized ─────────────────────────────────────────────────────────────

describe('regime_sized allocation', () => {
  it('reduces exposure in SHOCK regime', () => {
    const rangeResult = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ method: 'regime_sized' }));
    const shockResult = optimizePortfolio(signals, RegimeLabel.SHOCK, baseConfig({ method: 'regime_sized' }));
    expect(shockResult.totalExposure).toBeLessThan(rangeResult.totalExposure);
  });

  it('increases exposure in TREND_UP regime', () => {
    const rangeResult = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ method: 'regime_sized' }));
    const trendResult = optimizePortfolio(signals, RegimeLabel.TREND_UP, baseConfig({ method: 'regime_sized' }));
    expect(trendResult.totalExposure).toBeGreaterThan(rangeResult.totalExposure);
  });
});

// ── Max Positions ────────────────────────────────────────────────────────────

describe('max positions cap', () => {
  it('limits allocations to maxPositions', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ maxPositions: 2 }));
    expect(result.allocations).toHaveLength(2);
    const symbols = result.allocations.map((a) => a.symbol);
    expect(symbols).toContain('BTC/USDT');
    expect(symbols).toContain('ETH/USDT');
  });

  it('handles maxPositions = 0', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ maxPositions: 0 }));
    expect(result.allocations).toHaveLength(0);
    expect(result.totalExposure).toBe(0);
  });
});

// ── Min Confidence Filter ────────────────────────────────────────────────────

describe('min confidence filter', () => {
  it('filters signals below minConfidence', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ minConfidence: 0.7 }));
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].symbol).toBe('BTC/USDT');
  });

  it('returns empty when no signals meet threshold', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ minConfidence: 0.99 }));
    expect(result.allocations).toHaveLength(0);
    expect(result.totalExposure).toBe(0);
  });
});

// ── Cash Reserve ─────────────────────────────────────────────────────────────

describe('cash reserve', () => {
  it('reduces exposure by cashReservePct', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ cashReservePct: 0.2 }));
    expect(result.cashReserve).toBe(0.2);
    expect(result.totalExposure).toBeLessThanOrEqual(0.8 + 1e-9);
  });

  it('with 100% cash reserve, no allocations', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ cashReservePct: 1.0 }));
    expect(result.allocations).toHaveLength(0);
    expect(result.totalExposure).toBe(0);
    expect(result.cashReserve).toBe(1.0);
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty signals returns empty portfolio', () => {
    const result = optimizePortfolio([], RegimeLabel.RANGE, baseConfig());
    expect(result.allocations).toHaveLength(0);
    expect(result.totalExposure).toBe(0);
    expect(result.leverageRatio).toBe(0);
  });

  it('hold signals are excluded', () => {
    const holdSignals = [makeSignal('x', 'hold', 0.9, 'BTC/USDT')];
    const result = optimizePortfolio(holdSignals, RegimeLabel.RANGE, baseConfig());
    expect(result.allocations).toHaveLength(0);
  });

  it('maxExposurePct caps total exposure', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({ maxExposurePct: 0.5 }));
    expect(result.totalExposure).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('leverageRatio is computed correctly', () => {
    const result = optimizePortfolio(signals, RegimeLabel.RANGE, baseConfig({
      maxExposurePct: 1.5,
      cashReservePct: 0,
    }));
    expect(result.leverageRatio).toBeCloseTo(1.5, 4);
  });
});
