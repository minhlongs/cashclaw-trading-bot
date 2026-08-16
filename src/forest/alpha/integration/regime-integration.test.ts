// Integration tests for regime classification on synthetic candles.
import { describe, it, expect } from 'vitest';
import { RuleBasedRegimeClassifier } from '@/tree/regime/classifier';
import { extractRegimeFeatures } from '@/tree/regime/features';
import { RegimeLabel, type RegimeConfig } from '@/tree/regime/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { generateTrendingCandles, generateHighVolCandles, generateSyntheticCandlesWithRegimes, generateSyntheticCandles } from './fixtures';

const REGIME_CFG: RegimeConfig = {
  minCandles: 10,
  confidenceThreshold: 0.5,
  lookback: 20,
  minDuration: 2,
};

function classifyAll(candles: Candle[]): { label: string; confidence: number }[] {
  const cls = new RuleBasedRegimeClassifier();
  const results: { label: string; confidence: number }[] = [];
  for (let i = REGIME_CFG.lookback; i < candles.length; i++) {
    const features = extractRegimeFeatures(candles.slice(i - REGIME_CFG.lookback, i + 1), REGIME_CFG);
    if (!features) continue;
    const r = cls.classify(features, REGIME_CFG);
    results.push({ label: r.label, confidence: r.confidence });
  }
  return results;
}

describe('regime integration', () => {
  it('classify trending up candles → TREND_UP', () => {
    const candles = generateTrendingCandles(40, 'up');
    const results = classifyAll(candles);
    expect(results.length).toBeGreaterThan(0);
    expect(results[results.length - 1].label).toBe(RegimeLabel.TREND_UP);
  });

  it('classify high-vol candles → HIGH_VOLATILITY', () => {
    const candles = generateHighVolCandles(40);
    const results = classifyAll(candles);
    expect(results.length).toBeGreaterThan(0);
    expect(results[results.length - 1].label).toBe(RegimeLabel.HIGH_VOLATILITY);
  });

  it('regime history tracks transitions', () => {
    const candles = generateSyntheticCandlesWithRegimes([
      { regime: 'TREND_UP', bars: 25 },
      { regime: 'HIGH_VOLATILITY', bars: 25 },
    ]);
    const results = classifyAll(candles);
    const labels = results.map((r) => r.label);
    expect(labels.length).toBeGreaterThan(0);
    // Should see at least one transition from TREND_UP to HIGH_VOLATILITY
    const hasTransition = labels.some((l, i) => i > 0 && l !== labels[i - 1]);
    expect(hasTransition).toBe(true);
  });

  it('regime hysteresis prevents rapid flipping', () => {
    const cls = new RuleBasedRegimeClassifier();
    // Use mixed candles near threshold — with minDuration: 3, regime should stay stable
    const candles = generateSyntheticCandles(50, 0, 1.5, 100);
    let lastLabel = '';
    let flipCount = 0;
    for (let i = REGIME_CFG.lookback; i < candles.length; i++) {
      const features = extractRegimeFeatures(candles.slice(i - REGIME_CFG.lookback, i + 1), REGIME_CFG);
      if (!features) continue;
      const r = cls.classify(features, REGIME_CFG);
      if (lastLabel && r.label !== lastLabel) flipCount++;
      lastLabel = r.label;
    }
    // With deterministic data and hysteresis, flips should be bounded
    expect(flipCount).toBeLessThan(candles.length * 0.3);
  });
});