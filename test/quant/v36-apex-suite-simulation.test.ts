import { describe, expect, it } from 'vitest';
import { computeGatheralSchiedExecution } from '@/tree/quantlib/execution/gatheral-schied-engine';
import { computeRosuOrderBook } from '@/tree/quantlib/microstructure/rosu-orderbook-engine';
import { estimateRollingBetas } from '@/tree/alpha/cross-sectional/beta-estimation';
import { defaultConfigFromRow } from '@/tree/bot/bot-manager-default-config';
import { toD1Status } from '@/tree/bot/bot-manager-d1-status';
import type { AssetReturnSeries } from '@/tree/alpha/cross-sectional/types';

describe('Triad v36 Apex Suite End-to-End Cross-Domain Simulation', () => {
  it('orchestrates Gatheral-Schied execution, Roşu orderbook, and beta estimation in concert', () => {
    // 1. Quant Microstructure: Roşu dynamic limit order book
    const lob = computeRosuOrderBook({
      arrivalIntensity: 5.0,
      impatienceDiscountRate: 0.05,
      tickSize: 0.05,
      orderSize: 50,
      volatility: 0.015,
      depthLevels: 4,
    });
    expect(lob.equilibriumSpread).toBeGreaterThan(0.05);
    expect(lob.probLimitFillBeforeCancel).toBeGreaterThan(0.9);

    // 2. Quant Execution: Gatheral-Schied transient price impact liquidation
    const exec = computeGatheralSchiedExecution({
      initialInventory: 500,
      initialPrice: 200,
      timeHorizon: 2.0,
      numSteps: 4,
      instantaneousImpact: 0.005,
      decayRate: 0.8,
    });
    expect(exec.isNoArbitrageGuaranteed).toBe(true);
    expect(exec.totalCost).toBeGreaterThan(0);
    expect(exec.terminalInventory).toBe(0);

    // 3. Alpha Research: Beta estimation
    const benchmark: AssetReturnSeries = {
      symbol: 'BTC',
      timestamps: [1, 2, 3, 4, 5],
      returns: [0.01, -0.02, 0.015, -0.005, 0.02],
    };
    const asset: AssetReturnSeries = {
      symbol: 'ETH',
      timestamps: [1, 2, 3, 4, 5],
      returns: [0.012, -0.025, 0.018, -0.006, 0.022],
    };
    const betas = estimateRollingBetas([asset], benchmark, 5, 3);
    expect(betas['ETH']).toBeDefined();
    expect(betas['ETH']).toBeGreaterThan(0.9);

    // 4. Bot Management & D1 Status
    const config = defaultConfigFromRow({
      name: 'apex-bot',
      pair: 'BTC/USDT',
      exchange: 'binance',
      strategy: 'volatility_dca',
      capital_allocated: 5000,
    });
    expect(config.strategy).toBe('volatility_dca');
    expect(toD1Status('running')).toBe('paper_test');
    expect(toD1Status('unknown')).toBe('draft');
  });
});
