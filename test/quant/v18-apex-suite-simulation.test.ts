import { describe, it, expect } from 'vitest';
import { HayashiYoshidaEngine } from '../../src/tree/quantlib/leadlag/hayashi-yoshida-engine';
import type { AsynchronousTick } from '../../src/tree/quantlib/leadlag/hayashi-yoshida-types';
import { ContKukanovPlacementEngine } from '../../src/tree/quantlib/microstructure/cont-kukanov-placement-engine';
import { computeSlippageDiagnostics } from '../../src/forest/alpha/observability-eval/slippage-diagnostics';
import { computeOperationalDiagnostics } from '../../src/forest/alpha/observability-eval/telemetry-diagnostics';
import type { OperationalTelemetry, ShadowFill, ShadowOrder } from '../../src/tree/alpha/observability/types';

describe('Triad v18 Apex Suite Cross-Domain E2E Simulation', () => {
  it('orchestrates asynchronous lead-lag detection, Cont-Kukanov order placement, and modular observability', () => {
    // 1. Generate asynchronous non-synchronous ticks for Leader (X) and Follower (Y)
    // Follower mimics Leader with a 200ms delay and irregular tick arrivals
    const ticksX: AsynchronousTick[] = [];
    const ticksY: AsynchronousTick[] = [];
    let priceX = 50000;
    let priceY = 3000;

    for (let i = 0; i < 30; i++) {
      const timeX = 1700000000000 + i * 250 + (i % 3) * 10;
      const returnStep = (i % 2 === 0 ? 0.002 : -0.001) * (1 + 0.1 * (i % 5));
      priceX *= Math.exp(returnStep);
      ticksX.push({ timestampMs: timeX, price: priceX });

      // Follower responds ~200ms later with timestamp jitter
      const timeY = timeX + 200 + ((i * 17) % 35);
      priceY *= Math.exp(returnStep * 0.95);
      ticksY.push({ timestampMs: timeY, price: priceY });
    }

    // 2. Hayashi-Yoshida Continuous-Time Asynchronous Lead-Lag Analysis
    const hyEngine = new HayashiYoshidaEngine({ maxLagMs: 500, lagStepMs: 50, minObservations: 5 });
    const hyResult = hyEngine.computeAsynchronousCrossCorrelation(ticksX, ticksY);

    expect(hyResult.allLagMetrics.length).toBeGreaterThan(0);
    expect(hyResult.peakCorrelation).toBeGreaterThan(0.4);
    expect(hyResult.optimalLagMs).toBeGreaterThan(0);
    expect(hyResult.isLeader).toBe(true);

    // 3. Cont-Kukanov Optimal Order Placement Engine triggered by Alpha Signal
    const orderQty = 100; // units of asset Y to execute
    const ckEngine = new ContKukanovPlacementEngine({
      bidAskSpread: 0.0006, // 6 bps
      limitOrderFeeRate: -0.0001, // Maker rebate of 1 bps
      marketOrderFeeRate: 0.0005, // Taker fee 5 bps
      adverseSelectionCost: 0.0001, // 1 bps adverse selection
      nonExecutionPenalty: 0.0004, // 4 bps opportunity cost
      fillDecayRate: 0.02,
      numGridSteps: 50,
    });

    const placementResult = ckEngine.computeOptimalPlacement(orderQty);
    expect(placementResult.totalOrderQuantity).toBe(orderQty);
    expect(placementResult.optimalLimitQuantity).toBeGreaterThan(0);
    expect(placementResult.optimalMarketQuantity).toBeGreaterThan(0);
    expect(placementResult.optimalLimitQuantity + placementResult.optimalMarketQuantity).toBeCloseTo(orderQty, 4);
    expect(placementResult.makerSavingsBps).toBeGreaterThan(0);

    // 4. Observability and Slippage Diagnostics on Executed Child Orders
    const now = Date.now();
    const shadowOrders: ShadowOrder[] = [
      {
        orderId: 'ord-limit-1',
        symbol: 'ETH/USDT',
        side: 'buy',
        size: placementResult.optimalLimitQuantity,
        price: priceY,
        targetWeightDelta: 0.05,
        decisionTimestamp: now - 500,
      },
      {
        orderId: 'ord-market-2',
        symbol: 'ETH/USDT',
        side: 'buy',
        size: placementResult.optimalMarketQuantity,
        price: priceY,
        targetWeightDelta: 0.05,
        decisionTimestamp: now - 300,
      },
    ];

    const shadowFills: ShadowFill[] = [
      {
        fillId: 'fill-1',
        orderId: 'ord-limit-1',
        symbol: 'ETH/USDT',
        side: 'buy',
        fillQuantity: placementResult.optimalLimitQuantity,
        fillPrice: priceY,
        slippageBps: 0.5,
        feeAmount: placementResult.optimalLimitQuantity * priceY * 0.0001,
        fillTimestamp: now - 200,
        stressTier: 'normal',
      },
      {
        fillId: 'fill-2',
        orderId: 'ord-market-2',
        symbol: 'ETH/USDT',
        side: 'buy',
        fillQuantity: placementResult.optimalMarketQuantity,
        fillPrice: priceY * 1.0002,
        slippageBps: 2.0,
        feeAmount: placementResult.optimalMarketQuantity * priceY * 0.0005,
        fillTimestamp: now - 100,
        stressTier: 'normal',
      },
    ];

    const slippageDiag = computeSlippageDiagnostics(shadowOrders, shadowFills);
    expect(slippageDiag.realizedSlippageBpsMean).toBeGreaterThan(0);
    expect(slippageDiag.bySide.buy.fillCount).toBe(2);
    expect(slippageDiag.byStressTier.normal.fillCount).toBe(2);

    const telemetry: OperationalTelemetry[] = [
      {
        decisionLatencyMs: 15,
        dataFreshnessMs: 50,
        timestamp: now - 500,
        providerProvenance: {
          primaryProvider: 'binance-rest',
          activeProvider: 'binance-rest',
          usedFallback: false,
          fallbackAttempts: 0,
          providerLatencyMs: 12,
        },
      },
      {
        decisionLatencyMs: 22,
        dataFreshnessMs: 65,
        timestamp: now - 300,
        providerProvenance: {
          primaryProvider: 'binance-rest',
          activeProvider: 'binance-rest',
          usedFallback: false,
          fallbackAttempts: 0,
          providerLatencyMs: 18,
        },
      },
    ];

    const opDiag = computeOperationalDiagnostics(telemetry);
    expect(opDiag.latency.count).toBe(2);
    expect(opDiag.freshness.staleCount).toBe(0);
    expect(opDiag.provenance.primarySuccessRate).toBe(1.0);
  });
});
