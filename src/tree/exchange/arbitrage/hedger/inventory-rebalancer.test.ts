import { describe, it, expect } from 'vitest';
import { generateRebalanceOrders } from './inventory-rebalancer';
import { calculateDeltaExposure } from './delta-exposure-tracker';
import type { DualLegPortfolio } from './hedger-types';

describe('Inventory Rebalancer', () => {
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

  it('does not rebalance when drift is within bounds', () => {
    const exposure = calculateDeltaExposure(basePortfolio, 0.05);
    const action = generateRebalanceOrders(exposure, basePortfolio);
    expect(action.requiresRebalance).toBe(false);
    expect(action.adjustmentQuantity).toBe(0);
  });

  it('generates rebalance order to increase short leg when long leg increases in value', () => {
    const diverged: DualLegPortfolio = {
      ...basePortfolio,
      legA: { ...basePortfolio.legA, markPrice: 66000 }, // Leg A notional = 66,000
      legB: { ...basePortfolio.legB, markPrice: 60000 }, // Leg B notional = 60,000
    };
    const exposure = calculateDeltaExposure(diverged, 0.02);
    expect(exposure.isDriftExceeded).toBe(true);

    const action = generateRebalanceOrders(exposure, diverged);
    expect(action.requiresRebalance).toBe(true);
    expect(action.targetLegIndex).toBe('B');
    expect(action.side).toBe('sell'); // Short more
    expect(action.estimatedNotional).toBe(6000);
    expect(action.adjustmentQuantity).toBeCloseTo(6000 / 60000, 4); // 0.1 BTC
  });

  it('generates buy-to-reduce order when leg B short notional is higher than leg A', () => {
    const diverged: DualLegPortfolio = {
      ...basePortfolio,
      legA: { ...basePortfolio.legA, markPrice: 50000 }, // Leg A notional = 50,000
      legB: { ...basePortfolio.legB, markPrice: 60000 }, // Leg B notional = 60,000
    };
    const exposure = calculateDeltaExposure(diverged, 0.02);
    const action = generateRebalanceOrders(exposure, diverged);
    expect(action.requiresRebalance).toBe(true);
    expect(action.side).toBe('buy'); // Buy to reduce short
    expect(action.estimatedNotional).toBe(10000);
  });
});
