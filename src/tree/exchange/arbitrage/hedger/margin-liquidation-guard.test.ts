import { describe, it, expect } from 'vitest';
import { evaluateMarginSafety } from './margin-liquidation-guard';
import type { DualLegPortfolio } from './hedger-types';

describe('Margin & Liquidation Guard', () => {
  const safePortfolio: DualLegPortfolio = {
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
    collateralUsd: 50000, // Total notional = 120,000, req maint = 120,000 * 0.05 = 6,000
  };

  it('evaluates safe margin state under low leverage', () => {
    const safety = evaluateMarginSafety(safePortfolio);
    expect(safety.effectiveLeverage).toBe(2.4);
    expect(safety.marginUtilizationPct).toBe(6000 / 50000); // 12%
    expect(safety.isMarginWarning).toBe(false);
    expect(safety.isLiquidationCritical).toBe(false);
  });

  it('triggers warning and critical alarms as collateral depletes', () => {
    const stressedPortfolio: DualLegPortfolio = {
      ...safePortfolio,
      collateralUsd: 7000, // Utilization = 6000 / 7000 = 85.7% (critical)
    };
    const safety = evaluateMarginSafety(stressedPortfolio);
    expect(safety.isMarginWarning).toBe(true);
    expect(safety.isLiquidationCritical).toBe(true);
    expect(safety.liquidationDistancePct).toBeCloseTo(1000 / 7000, 4);
  });

  it('handles zero collateral safely', () => {
    const zeroCollateral: DualLegPortfolio = {
      ...safePortfolio,
      collateralUsd: 0,
    };
    const safety = evaluateMarginSafety(zeroCollateral);
    expect(safety.effectiveLeverage).toBe(0);
    expect(safety.marginUtilizationPct).toBe(1.0);
    expect(safety.isLiquidationCritical).toBe(true);
  });
});
