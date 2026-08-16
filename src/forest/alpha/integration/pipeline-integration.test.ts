// Integration tests for the full alpha research pipeline.
import { describe, it, expect } from 'vitest';
import { AlphaResearchPipeline } from '@/forest/alpha/pipeline/engine';
import { RegimeLabel, type RegimeConfig } from '@/tree/regime/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { WindowConfig } from '@/forest/backtest/walkforward';
import type { PipelineConfig } from '@/forest/alpha/pipeline/types';
import { generateTrendingCandles } from './fixtures';

const candles = generateTrendingCandles(60, 'up');

const regimeConfig: RegimeConfig = {
  minCandles: 10,
  confidenceThreshold: 0.4,
  lookback: 20,
  minDuration: 2,
};

const walkforwardConfig: WindowConfig = {
  trainBars: 10,
  validateBars: 5,
  testBars: 5,
  stepBars: 5,
};

const pipelineConfig: PipelineConfig = {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  candles,
  indicatorSet: { lookback: 20, sma: 20, rsi: 14, atr: 14, bollinger: 20 },
  regimeConfig,
  walkforwardConfig,
  costMode: 'normal',
  minSharpe: -10, // low bar so pipeline completes
  minTrades: 0,
  baselinesEnabled: true,
};

describe('pipeline integration', () => {
  it('full pipeline on synthetic data produces AlphaResearchReport', async () => {
    const pipeline = new AlphaResearchPipeline(pipelineConfig);
    const report = await pipeline.run();
    expect(report.symbol).toBe('BTCUSDT');
    expect(report.timeframe).toBe('1h');
    expect(typeof report.finalSharpe).toBe('number');
    expect(report.totalSteps).toBeGreaterThan(0);
    expect(report.passedSteps).toBeGreaterThan(0);
  });

  it('pipeline stops early when Sharpe < threshold', async () => {
    const strictConfig: PipelineConfig = {
      ...pipelineConfig,
      minSharpe: 999,
      minTrades: 999,
      baselinesEnabled: false,
    };
    const pipeline = new AlphaResearchPipeline(strictConfig);
    const report = await pipeline.run();
    expect(report.recommendation).toBe('discard');
    expect(report.finalSharpe).toBeLessThan(999);
  });

  it('pipeline result has all expected steps', async () => {
    const pipeline = new AlphaResearchPipeline(pipelineConfig);
    const report = await pipeline.run();
    const expectedSteps = [
      'fetch_data',
      'compute_indicators',
      'detect_regimes',
      'generate_signals',
      'label_events',
      'run_walkforward',
      'compute_costs',
      'evaluate',
      'attribute',
      'compare_baselines',
      'generate_report',
    ];
    const passedSteps = pipeline.getResults().filter((r) => r.status === 'success').map((r) => r.step);
    for (const step of expectedSteps) {
      expect(passedSteps).toContain(step);
    }
  });
});