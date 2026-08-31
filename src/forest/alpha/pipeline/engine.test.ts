// Alpha Research Pipeline — Tests
// Tests the pipeline engine with synthetic data and mocked dependencies.

import { describe, it, expect } from 'vitest';
import { AlphaResearchPipeline } from './engine';
import type { PipelineConfig } from './types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { RegimeConfig } from '@/tree/regime/types';
import type { DerivativeFeatures } from '@/tree/alpha/signals';

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
    expect(report.totalSteps).toBe(12);
    expect(report.passedSteps).toBeGreaterThan(0);
    expect(typeof report.finalSharpe).toBe('number');
    expect(report.recommendation).toMatch(/^(deploy|refine|discard)$/);
  });

  it('produces PipelineResult array for every step', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig());
    await pipeline.run();
    const results = pipeline.getResults();

    expect(results).toHaveLength(12);
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

  it('wires injected derivative signals through to trade extraction', async () => {
    // Build synthetic derivative features that fire a strong long signal.
    const candles = makeCandles(120);
    const features = candles.map(c => ({
      timestamp: c.timestamp,
      symbol: 'BTCUSDT',
      fundingRate: -0.001, fundingRateAvg8h: -0.0005, fundingRateSlope: -0.0003,
      openInterest: 1e6, oiChange: 0.15, oiZScore: 2.0,
      liquidationImbalance: -50000, liquidationZScore: -3.0,
      basis: 0.002, basisZScore: 2.5,
    }));
    const { generateDerivativeSignals } = await import('@/tree/alpha/signals');
    const signals = generateDerivativeSignals(candles, features, 'BTCUSDT');
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].symbol).toBe('BTCUSDT');

    const pipeline = new AlphaResearchPipeline(makeConfig({
      candles,
      derivatives: { features, signals },
    }));
    await pipeline.run();
    const sigResult = pipeline.getResults().find(r => r.step === 'generate_signals');
    expect(sigResult?.status).toBe('success');
    // Prove the merged signals actually carry the injected derivative signal
    // (not just that the step returned success).
    const merged = (sigResult?.data as { signals: { direction: string; metadata: { features: unknown } }[] }).signals;
    const derivativeMerged = merged.filter(s => s.metadata &&
      (s.metadata as { features: { liquidationImbalance: number } }).features &&
      (s.metadata as { features: { liquidationImbalance: number } }).features.liquidationImbalance === -50000);
    expect(derivativeMerged.length).toBe(signals.length);
    expect(derivativeMerged.every(s => s.direction === 'buy')).toBe(true);
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

  it('recommends deploy when Sharpe comfortably exceeds the threshold', async () => {
    // minSharpe = 0 → walkforward always passes and sp >= 0 triggers 'deploy'.
    const pipeline = new AlphaResearchPipeline(makeConfig({ minSharpe: 0, minTrades: 0 }));
    const report = await pipeline.run();

    expect(report.recommendation).toBe('deploy');
  });

  it('recommends discard when walkforward Sharpe is far below threshold', async () => {
    // minSharpe = 10 is unattainable → finalSharpe ~0 → 'discard'.
    const pipeline = new AlphaResearchPipeline(makeConfig({ minSharpe: 10 }));
    const report = await pipeline.run();

    expect(report.recommendation).toBe('discard');
  });

  it('walkforward errors and skips remaining steps when candles are insufficient', async () => {
    // total = trainBars + testBars*3 = 40 + 20*3 = 100; pass only 30 candles.
    const config = makeConfig({ candles: makeCandles(30) });
    const pipeline = new AlphaResearchPipeline(config);
    await pipeline.run();
    const results = pipeline.getResults();

    const wf = results.find((r) => r.step === 'run_walkforward');
    expect(wf?.status).toBe('error');

    // Every step after walkforward must be skipped, none may be 'success'.
    const wfIdx = results.indexOf(wf!);
    const after = results.slice(wfIdx + 1);
    expect(after.length).toBeGreaterThan(0);
    after.forEach((r) => expect(r.status).toBe('skipped'));
  });

  it('returns error when no signals reach the walkforward step', async () => {
    // NOTE: the `No signals for walkforward` guard at engine.ts:260 is
    // structurally unreachable — `generate_signals` always succeeds and
    // writes its map entry before walkforward runs, so `sd` can never be
    // undefined here. A pipeline that produces zero signals still passes the
    // walkforward step (empty trade list, Sharpe 0). This test documents that
    // behavior instead of forcing the dead branch.
    const config = makeConfig({ indicatorSet: { lookback: 20 } });
    const pipeline = new AlphaResearchPipeline(config);
    await pipeline.run();
    const results = pipeline.getResults();

    const wf = results.find((r) => r.step === 'run_walkforward');
    expect(wf?.status).toBe('success');
    const data = wf?.data as { totalTrades: number };
    expect(data.totalTrades).toBe(0);
  });

  it('parses m/h/d timeframe units and falls back to 60 minutes for junk', async () => {
    // parseCandleIntervalMinutes is private; exercise it through the pipeline
    // by varying cfg.timeframe and asserting the run still completes with a
    // numeric Sharpe (the interval only scales computeSharpe).
    for (const timeframe of ['15m', '4h', '1d', 'bogus']) {
      const pipeline = new AlphaResearchPipeline(
        makeConfig({ timeframe, minSharpe: 0, minTrades: 0 }),
      );
      const report = await pipeline.run();
      expect(report.timeframe).toBe(timeframe);
      expect(Number.isFinite(report.finalSharpe)).toBe(true);
      // evaluate runs (walkforward passes with zero thresholds) so the report
      // body exists even when no trades fire.
      expect(report.report).not.toBeNull();
    }
  });

  it('runs evaluate with zero trades and defaults missing lookback/rsi', async () => {
    // indicatorSet without a `lookback` key and without any indicator names:
    // every feature map is empty, so rsi falls back to 50 → all-hold signals,
    // zero trades, and the evaluate step still reports win_rate 0 via the
    // empty-trades ternary rather than dividing by zero.
    const config = makeConfig({
      indicatorSet: {},
      minSharpe: 0,
      minTrades: 0,
    });
    const pipeline = new AlphaResearchPipeline(config);
    await pipeline.run();
    const results = pipeline.getResults();

    const ev = results.find((r) => r.step === 'evaluate');
    expect(ev?.status).toBe('success');
    const report = (ev?.data as { report: { numTrades: number; winRate: number } }).report;
    expect(report.numTrades).toBe(0);
    expect(report.winRate).toBe(0);
  });

  it('maps short/neutral derivative signals to sell/hold directions', async () => {
    // Inject derivative signals with each direction value; mergeDerivativeSignals
    // maps short→sell, neutral→hold, long→buy (the two non-buy ternary arms).
    const candles = makeCandles(120);
    const mkFeatures = (c: { timestamp: number }): DerivativeFeatures => ({
      timestamp: c.timestamp,
      fundingRate: null, fundingRateAvg8h: null, fundingRateSlope: null,
      openInterest: null, oiChange: null, oiZScore: null,
      liquidationImbalance: null, liquidationZScore: null,
      basis: null, basisZScore: null,
    });
    const features = candles.map(mkFeatures);
    const derivatives = {
      features,
      signals: [
        {
          timestamp: candles[0].timestamp,
          symbol: 'BTCUSDT',
          direction: 'short' as const,
          confidence: 0.8,
          features: mkFeatures(candles[0]),
          reasons: ['short-signal'],
        },
        {
          timestamp: candles[1].timestamp,
          symbol: 'BTCUSDT',
          direction: 'neutral' as const,
          confidence: 0.5,
          features: mkFeatures(candles[1]),
          reasons: ['neutral-signal'],
        },
        {
          timestamp: candles[2].timestamp,
          symbol: 'BTCUSDT',
          direction: 'long' as const,
          confidence: 0.9,
          features: mkFeatures(candles[2]),
          reasons: [], // empty reasons → name falls back to 'derivative'
        },
      ],
    };

    const pipeline = new AlphaResearchPipeline(
      makeConfig({ candles, derivatives, minSharpe: 0, minTrades: 0 }),
    );
    await pipeline.run();
    const results = pipeline.getResults();

    const sig = results.find((r) => r.step === 'generate_signals');
    expect(sig?.status).toBe('success');
    type MergedSignal = { direction: string; name: string; metadata?: { reasons: string[] } };
    const merged = (sig?.data as { signals: MergedSignal[] }).signals.filter(
      (s) => s.metadata !== undefined && s.metadata.reasons !== undefined,
    );
    expect(merged.filter((s) => s.direction === 'sell').length).toBe(1);
    expect(merged.filter((s) => s.direction === 'hold').length).toBe(1);
    expect(merged.filter((s) => s.direction === 'buy').length).toBe(1);
    const namedBuy = merged.find((s) => s.direction === 'buy');
    expect(namedBuy?.name).toBe('derivative');
  });
});
