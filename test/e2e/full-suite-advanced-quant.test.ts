import { describe, it, expect } from 'vitest';

// Pillar 1: Hedger
import { calculateDeltaExposure } from '@/tree/exchange/arbitrage/hedger/delta-exposure-tracker';
import { generateRebalanceOrders } from '@/tree/exchange/arbitrage/hedger/inventory-rebalancer';
import { evaluateMarginSafety } from '@/tree/exchange/arbitrage/hedger/margin-liquidation-guard';
import type { DualLegPortfolio } from '@/tree/exchange/arbitrage/hedger/hedger-types';

// Pillar 2: Microstructure Alpha
import { calculateSingleStepOfi } from '@/tree/alpha/microstructure/ofi-calculator';
import { computeVpin } from '@/tree/alpha/microstructure/vpin-calculator';
import { deriveMicrostructureSignal } from '@/tree/alpha/microstructure/microstructure-signals';

// Pillar 3: Fleet Risk Commander
import { computeHrpAllocation } from '@/forest/risk/commander/hrp-allocator';
import { computeFractionalKelly } from '@/forest/risk/commander/fractional-kelly';
import { evaluateFleetCircuitBreaker } from '@/forest/risk/commander/fleet-circuit-breaker';

// Prior Realistic L2 Simulator
import { calculateOrderBookExecution } from '@/tree/exchange/simulator/slippage-model';

describe('Full-Suite Advanced Quantitative OS End-to-End Integration', () => {
  it('seamlessly executes full lifecycle: Microstructure Alpha -> Delta Rebalance -> Fleet Risk Allocation', () => {
    // 1. Pillar 2: L2 OFI & VPIN Microstructure Alpha Signal Generation
    const ofi = calculateSingleStepOfi(
      { bidPrice: 60000, bidSize: 2.0, askPrice: 60010, askSize: 1.0, timestampMs: 1000 },
      { bidPrice: 60005, bidSize: 3.5, askPrice: 60010, askSize: 0.8, timestampMs: 1100 },
    );
    expect(ofi.normalizedOfi).toBeGreaterThan(0.5);

    const vpin = computeVpin(
      [
        { price: 60005, size: 5, side: 'buy', timestampMs: 1105 },
        { price: 60006, size: 5, side: 'buy', timestampMs: 1110 },
      ],
      5,
      2,
    );
    expect(vpin.isToxic).toBe(true);

    const alphaSignal = deriveMicrostructureSignal(ofi, vpin);
    expect(alphaSignal.compositeDirection).toBe('buy');
    expect(alphaSignal.confidence).toBeGreaterThan(0.6);

    // 2. Pillar 1: Cross-Venue Delta-Neutral Hedging & Drift Rebalancing
    const dualPortfolio: DualLegPortfolio = {
      legA: {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        side: 'long',
        quantity: 2.0,
        entryPrice: 60000,
        markPrice: 63000, // Leg A appreciated (+5%) -> Notional = 126,000
      },
      legB: {
        exchange: 'okx',
        symbol: 'BTC/USDT',
        side: 'short',
        quantity: 2.0,
        entryPrice: 60000,
        markPrice: 60000, // Leg B unchanged -> Notional = 120,000
      },
      collateralUsd: 40000,
    };

    const exposure = calculateDeltaExposure(dualPortfolio, 0.02);
    expect(exposure.isDriftExceeded).toBe(true);
    expect(exposure.netDeltaNotional).toBe(6000);

    const rebalance = generateRebalanceOrders(exposure, dualPortfolio);
    expect(rebalance.requiresRebalance).toBe(true);
    expect(rebalance.targetLegIndex).toBe('B');
    expect(rebalance.side).toBe('sell'); // Short more Leg B to re-neutralize delta
    expect(rebalance.estimatedNotional).toBe(6000);

    // Check margin safety of the dual portfolio
    const margin = evaluateMarginSafety(dualPortfolio);
    expect(margin.isMarginWarning).toBe(false);
    expect(margin.effectiveLeverage).toBeCloseTo(246000 / 40000, 2);

    // Execute the rebalance leg on L2 Simulator
    const asks = [
      { price: 59990, size: 0.05 },
      { price: 59980, size: 0.1 },
    ];
    const fill = calculateOrderBookExecution('sell', rebalance.adjustmentQuantity, asks, 60000);
    expect(fill.executedPrice).toBeLessThanOrEqual(60000);

    // 3. Pillar 3: Fleet Risk Commander & Dynamic HRP Capital Sizing
    const hrp = computeHrpAllocation([
      {
        botId: 'bot-funding-arb',
        strategyKind: 'funding_arb',
        returnsSeries: [0.002, 0.001, 0.003, 0.002],
        currentAllocationUsd: 20000,
        maxDrawdownPct: 0.01,
      },
      {
        botId: 'bot-vol-dca',
        strategyKind: 'volatility_dca',
        returnsSeries: [0.02, -0.01, 0.03, -0.02],
        currentAllocationUsd: 20000,
        maxDrawdownPct: 0.08,
      },
    ]);
    expect(hrp.allocations['bot-funding-arb']).toBeGreaterThan(hrp.allocations['bot-vol-dca']);

    const kelly = computeFractionalKelly(0.65, 1.8);
    expect(kelly.recommendedLeverage).toBeGreaterThan(0.2);

    // Verify Fleet Circuit Breaker remains armed and ready
    const circuitBreaker = evaluateFleetCircuitBreaker(95000, 100000);
    expect(circuitBreaker.isTriggered).toBe(false);
    expect(circuitBreaker.actionRequired).toBe('none');
  });
});
