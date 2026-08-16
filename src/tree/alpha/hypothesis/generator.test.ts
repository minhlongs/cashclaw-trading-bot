import { describe, it, expect } from 'vitest';
import type { IndicatorCandle } from '../indicator-types';
import type { RegimeLabel } from '../../regime/types';
import { HypothesisGenerator } from './generator';
import { evaluateHypothesis } from './evaluator';
import type { AlphaHypothesis, HypothesisTemplate } from './types';

// ── Test Fixtures ──────────────────────────────────────────────────────────────

function makeCandles(n: number, basePrice = 100): IndicatorCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: Date.now() + i * 60_000,
    open: basePrice + Math.sin(i / 5) * 2,
    high: basePrice + Math.sin(i / 5) * 3 + 1,
    low: basePrice + Math.sin(i / 5) * 3 - 1,
    close: basePrice + Math.sin(i / 5) * 2.5,
    volume: 1000 + Math.random() * 500,
  }));
}

const TEMPLATES: HypothesisTemplate[] = [
  { name: 'trend-follow', description: 'Trend-following strategy', indicatorPreset: [{ indicator: 'ema', lookback: 20 }, { indicator: 'macd', lookback: 12 }], regimePreset: ['TREND_UP'], barrierPreset: { takeProfitPct: 0.02, stopLossPct: 0.01, maxHoldingMs: 24 * 3600_000 }, combinePreset: 'weighted_sum' },
  { name: 'mean-revert', description: 'Mean-reversion strategy', indicatorPreset: [{ indicator: 'bollinger', lookback: 20 }, { indicator: 'rsi', lookback: 14 }], regimePreset: ['RANGE'], barrierPreset: { takeProfitPct: 0.01, stopLossPct: 0.01, maxHoldingMs: 6 * 3600_000 }, combinePreset: 'max_confidence' },
  { name: 'momentum-burst', description: 'Momentum-based entry', indicatorPreset: [{ indicator: 'momentum', lookback: 10 }, { indicator: 'volume_zscore', lookback: 20 }], regimePreset: ['TREND_UP', 'HIGH_VOLATILITY'], barrierPreset: { takeProfitPct: 0.03, stopLossPct: 0.015, maxHoldingMs: 12 * 3600_000 }, combinePreset: 'voting' },
  { name: 'vol-surf', description: 'Volatility surface', indicatorPreset: [{ indicator: 'atr', lookback: 14 }, { indicator: 'realized_volatility', lookback: 30 }], regimePreset: ['HIGH_VOLATILITY'], barrierPreset: { takeProfitPct: 0.04, stopLossPct: 0.02, maxHoldingMs: 8 * 3600_000 }, combinePreset: 'weighted_sum' },
  { name: 'dual-sma', description: 'Dual SMA crossover', indicatorPreset: [{ indicator: 'sma', lookback: 20 }, { indicator: 'sma', lookback: 50 }], regimePreset: ['TREND_UP', 'TREND_DOWN'], barrierPreset: { takeProfitPct: 0.025, stopLossPct: 0.012, maxHoldingMs: 48 * 3600_000 }, combinePreset: 'voting' },
  { name: 'multi-signal', description: 'Multi-indicator blend', indicatorPreset: [{ indicator: 'rsi', lookback: 14 }, { indicator: 'macd', lookback: 12 }, { indicator: 'bollinger', lookback: 20 }, { indicator: 'volume_zscore', lookback: 20 }], regimePreset: [], barrierPreset: { takeProfitPct: 0.02, stopLossPct: 0.01, maxHoldingMs: 24 * 3600_000 }, combinePreset: 'weighted_sum' },
];

// ── Template Generation ────────────────────────────────────────────────────────

describe('HypothesisGenerator — generateFromTemplate', () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))(
    'generates valid hypothesis from template "%s"',
    (_name, template) => {
      const gen = new HypothesisGenerator();
      const h = gen.generateFromTemplate(template);
      expect(h.id).toMatch(/^h-/);
      expect(h.name).toContain(template.name);
      expect(h.indicatorSet.length).toBe(template.indicatorPreset.length);
      expect(h.combineMethod).toBe(template.combinePreset);
      expect(h.regimeFilter).toEqual(template.regimePreset);
      expect(h.barrierConfig).toEqual(template.barrierPreset);
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    },
  );
});

// ── Random Hypothesis Validity ────────────────────────────────────────────────

describe('HypothesisGenerator — generateRandomHypothesis', () => {
  it('always produces a valid hypothesis', () => {
    const gen = new HypothesisGenerator();
    for (let i = 0; i < 20; i++) {
      const h = gen.generateRandomHypothesis();
      expect(h.id).toBeTruthy();
      expect(h.indicatorSet.length).toBeGreaterThanOrEqual(2);
      expect(h.indicatorSet.length).toBeLessThanOrEqual(5);
      expect(h.indicatorSet.every((p) => p.lookback > 0)).toBe(true);
      expect(['weighted_sum', 'voting', 'max_confidence']).toContain(h.combineMethod);
      expect(h.regimeFilter.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each call produces a unique id', () => {
    const gen = new HypothesisGenerator();
    const ids = new Set(Array.from({ length: 50 }, () => gen.generateRandomHypothesis().id));
    expect(ids.size).toBe(50);
  });
});

// ── Regime-Specific Generation ────────────────────────────────────────────────

describe('HypothesisGenerator — generateRegimeSpecificHypothesis', () => {
  const regimes: RegimeLabel[] = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'SHOCK'];

  it.each(regimes)('produces valid hypothesis for regime %s', (regime) => {
    const gen = new HypothesisGenerator();
    const h = gen.generateRegimeSpecificHypothesis(regime);
    expect(h.id).toBeTruthy();
    expect(h.regimeFilter).toEqual([regime]);
    expect(h.indicatorSet.length).toBeGreaterThanOrEqual(2);
    expect(h.optimizerMethod).toBe('regime_sized');
  });

  it('uses regime-appropriate barrier config', () => {
    const gen = new HypothesisGenerator();
    const trendUp = gen.generateRegimeSpecificHypothesis('TREND_UP');
    expect(trendUp.barrierConfig.takeProfitPct).toBe(0.03);
    const range = gen.generateRegimeSpecificHypothesis('RANGE');
    expect(range.barrierConfig.takeProfitPct).toBe(0.01);
  });
});

// ── Evolution ──────────────────────────────────────────────────────────────────

describe('HypothesisGenerator — evolveHypothesis', () => {
  it('produces valid mutated offspring', () => {
    const gen = new HypothesisGenerator();
    const parent = gen.generateRandomHypothesis();
    const child = gen.evolveHypothesis(parent, 0.3);
    expect(child.id).not.toBe(parent.id);
    expect(child.indicatorSet.length).toBeGreaterThanOrEqual(1);
    expect(child.indicatorSet.length).toBeLessThanOrEqual(6);
    expect(['weighted_sum', 'voting', 'max_confidence']).toContain(child.combineMethod);
  });

  it('preserves validity under high mutation rate', () => {
    const gen = new HypothesisGenerator();
    const parent = gen.generateRandomHypothesis();
    for (let i = 0; i < 10; i++) {
      const child = gen.evolveHypothesis(parent, 0.7);
      expect(child.indicatorSet.length).toBeGreaterThanOrEqual(1);
      expect(child.combineMethod).toBeTruthy();
    }
  });

  it('low mutation rate tends to keep parent traits', () => {
    const gen = new HypothesisGenerator();
    const parent = gen.generateRandomHypothesis();
    let sameCombiner = 0;
    for (let i = 0; i < 20; i++) {
      const child = gen.evolveHypothesis(parent, 0.05);
      if (child.combineMethod === parent.combineMethod) sameCombiner++;
    }
    // With 0.05 mutation, parent combiner should be preserved >60% of the time
    expect(sameCombiner).toBeGreaterThan(12);
  });
});

// ── Evaluation ─────────────────────────────────────────────────────────────────

describe('evaluateHypothesis', () => {
  it('evaluates a hypothesis without crashing', () => {
    const gen = new HypothesisGenerator();
    const h = gen.generateRandomHypothesis();
    const candles = makeCandles(100);
    const result = evaluateHypothesis(h, candles);
    expect(result.hypothesisId).toBe(h.id);
    expect(result.totalSignals).toBeGreaterThanOrEqual(0);
    expect(result.avgConfidence).toBeGreaterThanOrEqual(0);
    expect(result.avgConfidence).toBeLessThanOrEqual(1);
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
  });

  it('returns empty evaluation for insufficient candles', () => {
    const gen = new HypothesisGenerator();
    const h = gen.generateRandomHypothesis();
    const result = evaluateHypothesis(h, makeCandles(10));
    expect(result.totalSignals).toBe(0);
  });
});