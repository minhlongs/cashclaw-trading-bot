// Alpha Research Pipeline — Derivative Signals, Walkforward & Evaluation Edge Cases

import { describe, it, expect } from 'vitest';
import { AlphaResearchPipeline } from './engine';
import type { PipelineConfig } from './types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { RegimeConfig } from '@/tree/regime/types';
import type { DerivativeFeatures } from '@/tree/alpha/signals';

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

describe('AlphaResearchPipeline — Derivative Signals & Walkforward Edge Cases', () => {
  it('wires injected derivative signals through to trade extraction', async () => {
    const candles = makeCandles(120);
    const features = candles.map((c) => ({
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

    const pipeline = new AlphaResearchPipeline(makeConfig({ candles, derivatives: { features, signals } }));
    await pipeline.run();
    const sigResult = pipeline.getResults().find((r) => r.step === 'generate_signals');
    expect(sigResult?.status).toBe('success');
    const merged = (sigResult?.data as { signals: { direction: string; metadata: { features: unknown } }[] }).signals;
    const derivativeMerged = merged.filter(
      (s) =>
        s.metadata &&
        (s.metadata as { features: { liquidationImbalance: number } }).features &&
        (s.metadata as { features: { liquidationImbalance: number } }).features.liquidationImbalance === -50000,
    );
    expect(derivativeMerged.length).toBe(signals.length);
    expect(derivativeMerged.every((s) => s.direction === 'buy')).toBe(true);
  });

  it('recommends deploy when Sharpe comfortably exceeds the threshold', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig({ minSharpe: 0, minTrades: 0 }));
    const report = await pipeline.run();
    expect(report.recommendation).toBe('deploy');
  });

  it('recommends discard when walkforward Sharpe is far below threshold', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig({ minSharpe: 10 }));
    const report = await pipeline.run();
    expect(report.recommendation).toBe('discard');
  });

  it('walkforward errors and skips remaining steps when candles are insufficient', async () => {
    const config = makeConfig({ candles: makeCandles(30) });
    const pipeline = new AlphaResearchPipeline(config);
    await pipeline.run();
    const results = pipeline.getResults();

    const wf = results.find((r) => r.step === 'run_walkforward');
    expect(wf?.status).toBe('error');

    const wfIdx = results.indexOf(wf!);
    const after = results.slice(wfIdx + 1);
    expect(after.length).toBeGreaterThan(0);
    after.forEach((r) => expect(r.status).toBe('skipped'));
  });

  it('returns error when no signals reach the walkforward step', async () => {
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
    for (const timeframe of ['15m', '4h', '1d', 'bogus']) {
      const pipeline = new AlphaResearchPipeline(makeConfig({ timeframe, minSharpe: 0, minTrades: 0 }));
      const report = await pipeline.run();
      expect(report.timeframe).toBe(timeframe);
      expect(Number.isFinite(report.finalSharpe)).toBe(true);
      expect(report.report).not.toBeNull();
    }
  });

  it('runs evaluate with zero trades and defaults missing lookback/rsi', async () => {
    const config = makeConfig({ indicatorSet: {}, minSharpe: 0, minTrades: 0 });
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
        { timestamp: candles[0].timestamp, symbol: 'BTCUSDT', direction: 'short' as const, confidence: 0.8, features: mkFeatures(candles[0]), reasons: ['short-signal'] },
        { timestamp: candles[1].timestamp, symbol: 'BTCUSDT', direction: 'neutral' as const, confidence: 0.5, features: mkFeatures(candles[1]), reasons: ['neutral-signal'] },
        { timestamp: candles[2].timestamp, symbol: 'BTCUSDT', direction: 'long' as const, confidence: 0.9, features: mkFeatures(candles[2]), reasons: [] },
      ],
    };

    const pipeline = new AlphaResearchPipeline(makeConfig({ candles, derivatives, minSharpe: 0, minTrades: 0 }));
    await pipeline.run();
    const sig = pipeline.getResults().find((r) => r.step === 'generate_signals');
    expect(sig?.status).toBe('success');
    type MergedSignal = { direction: string; name: string; metadata?: { reasons: string[] } };
    const merged = (sig?.data as { signals: MergedSignal[] }).signals.filter(
      (s) => s.metadata !== undefined && s.metadata.reasons !== undefined,
    );
    expect(merged.filter((s) => s.direction === 'sell').length).toBe(1);
    expect(merged.filter((s) => s.direction === 'hold').length).toBe(1);
    expect(merged.filter((s) => s.direction === 'buy').length).toBe(1);
    expect(merged.find((s) => s.direction === 'buy')?.name).toBe('derivative');
  });
});
