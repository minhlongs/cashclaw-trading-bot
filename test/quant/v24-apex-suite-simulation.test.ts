import { describe, expect, it } from 'vitest';
import { computeHuangStollDecomposition } from '@/tree/quantlib/microstructure/huang-stoll-spread-engine';
import { computeBertsimasLoExecution } from '@/tree/quantlib/execution/bertsimas-lo-execution-engine';
import { grid } from '@/tree/quantlib/strategies-grid';
import { meanReversion } from '@/tree/quantlib/strategies-mean-reversion';
import { extractTrades, computeEquityAndSharpe } from '@/forest/alpha/pipeline/pipeline-utils';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { AlphaSignal } from '@/tree/alpha/types';

describe('Triad v24 Apex Suite Cross-Domain Integration Simulation', () => {
  it('connects Huang-Stoll spread decomposition to Bertsimas-Lo optimal execution and modular pipeline', () => {
    // 1. Synthesize microstructure trade stream
    const ticks = [
      { midpoint: 100.0, tradeDirection: 1 as const, price: 100.05 },
      { midpoint: 100.02, tradeDirection: 1 as const, price: 100.07 },
      { midpoint: 100.05, tradeDirection: 1 as const, price: 100.10 },
      { midpoint: 100.03, tradeDirection: -1 as const, price: 99.98 },
      { midpoint: 100.01, tradeDirection: -1 as const, price: 99.96 },
      { midpoint: 100.04, tradeDirection: 1 as const, price: 100.09 },
      { midpoint: 100.06, tradeDirection: 1 as const, price: 100.11 },
    ];

    // 2. Microstructure decomposition: evaluate effective spread & adverse selection
    const hs = computeHuangStollDecomposition(ticks);
    expect(hs.spread).toBeGreaterThan(0);
    expect(hs.orderProcessingShare + hs.inventoryHoldingShare + hs.adverseSelectionShare).toBeCloseTo(1.0, 6);

    // 3. Calibrate impact parameters from decomposed microstructure friction
    const calibratedEta = Math.max(1e-4, hs.orderProcessingShare * (hs.spread / 2));
    const calibratedGamma = Math.max(1e-4, hs.adverseSelectionShare * (hs.spread / 2));

    // 4. Bertsimas-Lo dynamic optimal liquidation
    const execution = computeBertsimasLoExecution({
      totalShares: 5000,
      numSteps: 5,
      temporaryImpactEta: calibratedEta,
      permanentImpactGamma: calibratedGamma,
      volatility: 0.018,
      riskAversion: 0.005,
    });

    expect(execution.trajectory).toHaveLength(5);
    const executedShares = execution.trajectory.reduce((s, step) => s + step.tradeSize, 0);
    expect(executedShares).toBeCloseTo(5000, 4);
    expect(execution.impactSavings).toBeGreaterThanOrEqual(0);

    // 5. Evaluate modularized QuantLib strategies (grid & mean-reversion)
    const ctx = {
      symbol: 'BTC/USDT',
      balance: 10000,
      lastPrice: 100.04,
    };
    const gridRes = grid(ctx, { gridSpacing: 0.02, levels: 3, tolerance: 0.01, anchor: 100.0 });
    expect(['buy', 'sell', 'hold']).toContain(gridRes.signal);

    const mrRes = meanReversion(ctx, { fairValue: 102.0, threshold: 0.01 });
    expect(mrRes.signal).toBe('buy'); // price 100.04 is ~1.92% below fair value 102.0
    expect(mrRes.confidence).toBeGreaterThan(0);

    // 6. Alpha pipeline trades extraction & Sharpe validation
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 50 },
      { timestamp: 2000, open: 100, high: 102, low: 99.5, close: 101.5, volume: 60 },
      { timestamp: 3000, open: 101.5, high: 103, low: 101, close: 102.5, volume: 55 },
    ];
    const dummyFeatures = { features: [], computedAt: 1000, symbol: 'BTC/USDT', lookback: 10 };
    const signals: AlphaSignal[] = [
      { name: 'test-alpha', source: 'indicator', direction: 'buy', confidence: 0.8, timestamp: 1000, features: dummyFeatures, metadata: {} },
      { name: 'test-alpha', source: 'indicator', direction: 'sell', confidence: 0.7, timestamp: 2000, features: dummyFeatures, metadata: {} },
      { name: 'test-alpha', source: 'indicator', direction: 'hold', confidence: 0, timestamp: 3000, features: dummyFeatures, metadata: {} },
    ];
    const trades = extractTrades(signals, candles, 0);
    expect(trades.length).toBeGreaterThanOrEqual(1);

    const performance = computeEquityAndSharpe(trades, '1h');
    expect(performance.equityCurve.length).toBeGreaterThanOrEqual(1);
  });
});
