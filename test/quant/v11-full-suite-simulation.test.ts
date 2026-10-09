import { describe, it, expect } from 'vitest';
import { VectorizedFactorEngine } from '../../src/tree/research/vectorized/vectorized-factor-engine';
import { ExecutionOmsWaterfall } from '../../src/tree/execution/oms/execution-oms-waterfall';
import { KalmanCointegrationEngine } from '../../src/tree/quantlib/kalman/kalman-cointegration-engine';
import { TransientImpactEngine } from '../../src/tree/quantlib/impact/transient-impact-engine';
import { GreeksHedgingDesk } from '../../src/tree/quantlib/hedging/greeks-hedging-desk';
import type { InboundOrder } from '../../src/tree/execution/oms/execution-oms-types';

describe('v11 Full Architecture Triad & Execution Simulation', () => {
  it('executes cohesive multi-pillar quant workflow end-to-end', () => {
    // 1. Vectorized Research Factor Generation
    const factorEngine = new VectorizedFactorEngine();
    const factorSeries = {
      name: 'STAT_ARB_ZSCORE',
      data: new Float64Array([2.1, 1.8, 1.2, -0.5, -1.8, -2.4, 0.2, 0.9, -1.1, 1.5]),
    };
    const returnsSeries = new Float64Array([-0.02, -0.015, -0.01, 0.005, 0.018, 0.025, -0.002, -0.008, 0.012, -0.014]);
    const factorIc = factorEngine.computeFactorIc(factorSeries, returnsSeries);
    expect(factorIc.spearmanIc).toBeLessThan(-0.8); // Mean-reversion factor exhibits negative IC with forward returns

    // 2. Kalman Cointegration Tracking
    const kalmanEngine = new KalmanCointegrationEngine();
    let kalmanState = kalmanEngine.update({ priceX: 100, priceY: 150 });
    for (let i = 1; i <= 20; i++) {
      kalmanState = kalmanEngine.update({ priceX: 100 + i * 0.2, priceY: 150 + i * 0.3 });
    }
    expect(kalmanState.beta).toBeGreaterThan(0);

    // 3. Execution OMS Waterfall
    const oms = new ExecutionOmsWaterfall({ slicingThresholdQty: 2, maxSlices: 3 });
    const order: InboundOrder = {
      orderId: 'INST-ORD-88',
      symbol: 'ETH/USDT',
      side: 'BUY',
      quantity: 6,
      strategyId: 'ARB-DESK',
      timestamp: Date.now(),
    };
    const omsResult = oms.processOrder(order, 3000, [], 0.1);
    expect(omsResult.state).toBe('ROUTING');
    expect(omsResult.slices).toHaveLength(3);
    expect(omsResult.routedQuantity).toBeCloseTo(6, 5);

    // 4. Transient Market Impact Computation
    const impactEngine = new TransientImpactEngine();
    const impactSlices = omsResult.slices.map((s, idx) => ({ time: idx * 60, quantity: s.quantity }));
    const impactResult = impactEngine.evaluateImpactTrajectory(impactSlices, 3000);
    expect(impactResult.totalExecutionSlippageCost).toBeGreaterThan(0);

    // 5. Greeks Risk Boundary Hedging
    const hedgingDesk = new GreeksHedgingDesk({ maxDeltaExposure: 4.0 });
    const hedgeEvaluation = hedgingDesk.evaluateAndHedge({ delta: 6.0, gamma: 0.1, vega: 50 });
    expect(hedgeEvaluation.isBreached).toBe(true);
    expect(hedgeEvaluation.rebalanceOrders).toHaveLength(1);
    expect(hedgeEvaluation.rebalanceOrders[0]?.action).toBe('SELL');
  });
});
