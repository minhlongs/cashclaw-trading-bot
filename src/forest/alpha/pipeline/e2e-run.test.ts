// Alpha Research Pipeline — E2E Integration Test
//
// Runs the full 12-step pipeline with synthetic candles and injected
// derivative data. This proves the complete data path from raw OHLCV
// through derivatives, indicators, regimes, signals, labeling, walkforward,
// and (when walkforward passes) evaluation, costs, attribution, baselines,
// and report generation.
//
// Synthetic data does not contain real alpha, so walkforward will correctly
// reject the strategy (passed: false) and the downstream steps are skipped.
// This is the honest pipeline behavior — no fake positive results.

import { describe, it, expect } from 'vitest';
import { AlphaResearchPipeline } from './engine';
import type { PipelineConfig } from './types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { generateDerivativeSignals } from '@/tree/alpha/signals';

function makeSyntheticCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 60000;
  for (let i = 0; i < count; i++) {
    const variance = Math.sin(i * 0.15) * 200 + Math.cos(i * 0.07) * 300;
    price = Math.max(50000, price + variance);
    candles.push({
      timestamp: 1_700_000_000_000 + i * 3_600_000,
      open: price - 50,
      high: price + 80,
      low: price - 80,
      close: price,
      volume: 1_000_000 + Math.floor(Math.sin(i * 0.2) * 500_000),
    });
  }
  return candles;
}

function makeDerivativeData(candles: Candle[]) {
  const features = candles.map((c, i) => ({
    timestamp: c.timestamp,
    symbol: 'BTCUSDT',
    fundingRate: i > 5 ? -0.0008 : null,
    fundingRateAvg8h: i > 5 ? -0.0005 : null,
    fundingRateSlope: i > 5 ? -0.0002 : null,
    openInterest: 1e6 + i * 10_000,
    oiChange: i > 5 ? 0.15 : null,
    oiZScore: i > 10 ? 2.2 : null,
    liquidationImbalance: i > 5 ? -80_000 : 0,
    liquidationZScore: i > 10 ? -3.5 : null,
    basis: i > 5 ? 0.003 : null,
    basisZScore: i > 15 ? 2.8 : null,
  }));
  const signals = generateDerivativeSignals(candles, features, 'BTCUSDT');
  return { features, signals };
}

describe('AlphaResearchPipeline e2e with derivative injection', () => {
  it('runs all 12 steps and reaches generate_report', async () => {
    const candles = makeSyntheticCandles(200);
    const derivatives = makeDerivativeData(candles);

    const config: PipelineConfig = {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles,
      derivatives,
      indicatorSet: { sma: 20, rsi: 14, atr: 14, bollinger: 20, macd: 26, volume_zscore: 20, lookback: 20 },
      regimeConfig: { minCandles: 10, confidenceThreshold: 0.6, lookback: 20, minDuration: 3 },
      walkforwardConfig: { trainBars: 60, validateBars: 20, testBars: 20, stepBars: 20 },
      costMode: 'normal',
      minSharpe: 0.5,
      minTrades: 3,
      baselinesEnabled: true,
    };

    const pipeline = new AlphaResearchPipeline(config);
    const report = await pipeline.run();

    const results = pipeline.getResults();
    // All 12 steps must appear in the results array.
    expect(results).toHaveLength(12);

    // No step should have errored — failures should degrade gracefully.
    const errored = results.filter(r => r.status === 'error');
    for (const r of errored) {
      console.error(`[e2e] step ${r.step} error: ${r.error}`);
    }
    expect(errored).toHaveLength(0);

    // Steps before walkforward must all succeed.
    const preWalkforward = [
      'fetch_data', 'fetch_derivatives', 'compute_indicators',
      'detect_regimes', 'generate_signals', 'label_events',
    ] as const;
    for (const step of preWalkforward) {
      expect(results.find(r => r.step === step)?.status).toBe('success');
    }

    // Walkforward step itself must succeed (no error), but may return
    // passed: false if synthetic data lacks sufficient tradeable signals.
    const wf = results.find(r => r.step === 'run_walkforward');
    expect(wf?.status).toBe('success');

    // Downstream steps may be skipped if walkforward did not pass.
    // This is correct behavior — no fake positive results.
    const downstreamSteps = [
      'evaluate', 'compute_costs', 'attribute',
      'compare_baselines', 'generate_report',
    ] as const;
    for (const step of downstreamSteps) {
      const r = results.find(r => r.step === step);
      expect(r?.status === 'success' || r?.status === 'skipped').toBe(true);
    }

    // Report must have valid structure regardless of walkforward outcome.
    expect(report.symbol).toBe('BTCUSDT');
    expect(typeof report.finalSharpe).toBe('number');
    expect(report.recommendation).toMatch(/^(deploy|refine|discard)$/);
    expect(report.totalSteps).toBe(12);

    // Derivative signals were merged into the signal set.
    const sigData = results.find(r => r.step === 'generate_signals')?.data as { signals: Array<{ metadata?: { features?: unknown } }> } | undefined;
    expect(sigData?.signals).toBeDefined();
    const derivativeSignals = sigData!.signals.filter(
      s => s.metadata && typeof s.metadata === 'object' && 'features' in s.metadata,
    );
    expect(derivativeSignals.length).toBeGreaterThan(0);

    console.log(
      `[e2e] steps: ${results.length}, passed: ${report.passedSteps}, ` +
      `sharpe: ${report.finalSharpe.toFixed(4)}, rec: ${report.recommendation}, ` +
      `derivative_signals: ${derivativeSignals.length}`,
    );
  });
});
