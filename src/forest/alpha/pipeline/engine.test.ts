// Alpha Research Pipeline — Tests
// Tests the pipeline engine with synthetic data and mocked dependencies.

import { describe, it, expect } from 'vitest';
import { AlphaResearchPipeline } from './engine';
import type { PipelineConfig } from './types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { RegimeConfig } from '@/tree/regime/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCandles(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const variance = Math.sin(i * 0.1) * 2 + Math.cos(i * 0.05) * 3;
    price = Math.max(1, price + variance);
    candles.push({
      timestamp: Date.now() + i * 3_600_000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000 + Math.floor(Math.random() * 500),
    });
  }
  return candles;
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    candles: makeCandles(120),
    indicatorSet: { sma: 20, rsi: 14, atr: 14, lookback: 20 },
    regimeConfig: {
      minCandles: 10,
      confidenceThreshold: 0.6,
      lookback: 20,
      minDuration: 3,
    } as RegimeConfig,
    walkforwardConfig: {
      trainBars: 40,
      validateBars: 20,
      testBars: 20,
      stepBars: 20,
    },
    costMode: 'normal',
    minSharpe: 0.5,
    minTrades: 3,
    baselinesEnabled: false,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AlphaResearchPipeline', () => {
  it('runs all steps and returns a structured report', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig());
    const report = await pipeline.run();

    expect(report.symbol).toBe('BTCUSDT');
    expect(report.timeframe).toBe('1h');
    expect(report.totalSteps).toBe(11);
    expect(report.passedSteps).toBeGreaterThan(0);
    expect(typeof report.finalSharpe).toBe('number');
    expect(report.recommendation).toMatch(/^(deploy|refine|discard)$/);
  });

  it('produces PipelineResult array for every step', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig());
    await pipeline.run();
    const results = pipeline.getResults();

    expect(results).toHaveLength(11);
    const steps = results.map((r) => r.step);
    expect(steps).toContain('fetch_data');
    expect(steps).toContain('compute_indicators');
    expect(steps).toContain('detect_regimes');
    expect(steps).toContain('generate_report');
  });

  it('each result has duration and valid status', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig());
    await pipeline.run();

    for (const r of pipeline.getResults()) {
      expect(r.duration).toBeGreaterThanOrEqual(0);
      expect(['success', 'skipped', 'error']).toContain(r.status);
    }
  });

  it('skips later steps after walkforward early stop', async () => {
    const candles = makeCandles(120, 100);
    // Flat prices -> very low Sharpe -> early stop
    for (let i = 0; i < candles.length; i++) {
      candles[i].close = 100;
      candles[i].high = 100.1;
      candles[i].low = 99.9;
    }
    const config = makeConfig({
      candles,
      minSharpe: 10, // impossible threshold
      minTrades: 0,
    });

    const pipeline = new AlphaResearchPipeline(config);
    await pipeline.run();
    const results = pipeline.getResults();

    const skipped = results.filter((r) => r.status === 'skipped');
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('returns error result for invalid candle data', async () => {
    const config = makeConfig({ candles: [] });
    const pipeline = new AlphaResearchPipeline(config);
    await pipeline.run();
    const results = pipeline.getResults();

    const fetchResult = results.find((r) => r.step === 'fetch_data');
    expect(fetchResult?.status).toBe('error');
  });

  it('includes regime breakdown in final report', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig());
    const report = await pipeline.run();

    expect(report.regimeBreakdown).toBeDefined();
    expect(typeof report.regimeBreakdown).toBe('object');
  });

  it('baselines return empty when disabled', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig({ baselinesEnabled: false }));
    await pipeline.run();
    const results = pipeline.getResults();

    const baselineResult = results.find((r) => r.step === 'compare_baselines');
    if (baselineResult?.status === 'success') {
      const data = baselineResult.data as { baselines: unknown[] };
      expect(data.baselines).toHaveLength(0);
    }
  });

  it('top features are extracted from attributions', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig());
    const report = await pipeline.run();

    expect(Array.isArray(report.topFeatures)).toBe(true);
    if (report.topFeatures.length > 0) {
      expect(typeof report.topFeatures[0].name).toBe('string');
      expect(typeof report.topFeatures[0].importance).toBe('number');
    }
  });
});
