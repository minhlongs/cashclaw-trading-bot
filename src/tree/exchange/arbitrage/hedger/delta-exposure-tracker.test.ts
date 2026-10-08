import { describe, it, expect } from 'vitest';
import { calculateDeltaExposure } from './delta-exposure-tracker';
import type { DualLegPortfolio } from './hedger-types';

describe('Delta Exposure Tracker', () => {
  const basePortfolio: DualLegPortfolio = {
    legA: {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'long',
      quantity: 1.0,
      entryPrice: 60000,
      markPrice: 60000,
    },
    legB: {
      exchange: 'okx',
      symbol: 'BTC/USDT',
      side: 'short',
      quantity: 1.0,
      entryPrice: 60000,
      markPrice: 60000,
    },
    collateralUsd: 20000,
  };

  it('reports zero net delta when legs are perfectly balanced', () => {
    const exposure = calculateDeltaExposure(basePortfolio);
    expect(exposure.netDeltaNotional).toBe(0);
    expect(exposure.deltaDriftRatio).toBe(0);
    expect(exposure.isDriftExceeded).toBe(false);
  });

  it('detects delta drift when mark prices diverge', () => {
    const diverged: DualLegPortfolio = {
      ...basePortfolio,
      legA: { ...basePortfolio.legA, markPrice: 63000 }, // +5%
      legB: { ...basePortfolio.legB, markPrice: 60000 },
    };
    const exposure = calculateDeltaExposure(diverged, 0.02);
    expect(exposure.netDeltaNotional).toBe(3000);
    expect(exposure.deltaDriftRatio).toBeCloseTo(3000 / 123000, 4);
    expect(exposure.isDriftExceeded).toBe(true);
  });

  it('handles empty or zero quantity portfolio gracefully', () => {
    const empty: DualLegPortfolio = {
      ...basePortfolio,
      legA: { ...basePortfolio.legA, quantity: 0 },
      legB: { ...basePortfolio.legB, quantity: 0 },
    };
    const exposure = calculateDeltaExposure(empty);
    expect(exposure.netDeltaNotional).toBe(0);
    expect(exposure.deltaDriftRatio).toBe(0);
    expect(exposure.isDriftExceeded).toBe(false);
  });
});
