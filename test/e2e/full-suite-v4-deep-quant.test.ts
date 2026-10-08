import { describe, it, expect } from 'vitest';
import { initializeKalmanState, updateKalmanState } from '../../src/tree/quantlib/statarb/kalman-filter-hedge';
import { estimateOuParameters } from '../../src/tree/quantlib/statarb/ou-cointegration-estimator';
import { generateStatArbSignal } from '../../src/tree/quantlib/statarb/statarb-signal-generator';
import { interceptOrderExecution } from '../../src/tree/execution/runtime/fleet-risk-interceptor';
import { coordinateParentOrderExecution } from '../../src/tree/execution/runtime/sor-execution-coordinator';
import type { VenueLiquidityProfile } from '../../src/tree/execution/smart/smart-execution-types';

describe('E2E Full-Suite v4 Deep Quant & Statistical Arbitrage Pipeline', () => {
  it('executes full pipeline: Cointegration -> Kalman Hedge -> StatArb Signal -> Risk Guard -> SOR Coordination', () => {
    // 1. Establish cointegrated synthetic pair prices (BTC as x, ETH as y)
    let kalmanState = initializeKalmanState(1.2, 1.0);
    const trueBeta = 1.25;
    const spreads: number[] = [];

    for (let t = 1; t <= 120; t++) {
      const priceBtc = 60000 + t * 10;
      // Synthetic mean-reverting spread around equilibrium
      const spreadNoise = Math.sin(t / 5) * 50;
      const priceEth = trueBeta * priceBtc + spreadNoise;

      const update = updateKalmanState(kalmanState, priceBtc, priceEth);
      kalmanState = update.nextState;
      spreads.push(update.residual);
    }

    // Dynamic hedge ratio should converge near true beta
    expect(Math.abs(kalmanState.beta - trueBeta)).toBeLessThan(0.1);

    // 2. Ornstein-Uhlenbeck parameter estimation on residual spread
    const ouMetrics = estimateOuParameters(spreads);
    expect(ouMetrics.theta).toBeGreaterThan(0);
    expect(ouMetrics.halfLifeBars).toBeGreaterThan(0);

    const effectiveStd = ouMetrics.equilibriumStd > 0 ? ouMetrics.equilibriumStd : 30.0;
    const latestSpread = ouMetrics.mu - 2.5 * effectiveStd; // Exactly -2.5 sigma
    const signal = generateStatArbSignal(
      latestSpread,
      ouMetrics.mu,
      effectiveStd,
      kalmanState.beta,
    );

    expect(signal.action).toBe('ENTER_LONG_SPREAD');
    expect(signal.zScore).toBeLessThan(-2.0);
    expect(signal.zScore).toBeGreaterThan(-3.5);

    // 4. Intercept with Fleet Risk Guard before execution
    const portfolioEquity = 95_000;
    const peakEquity = 100_000; // 5% drawdown (under 8% warning threshold)
    const orderQuantity = 2.0;

    const riskDecision = interceptOrderExecution(orderQuantity, portfolioEquity, peakEquity);
    expect(riskDecision.allowed).toBe(true);
    expect(riskDecision.action).toBe('execute');
    expect(riskDecision.adjustedQuantity).toBe(2.0);

    // 5. Smart Order Routing & TWAP Slicing across simulated venues
    const venues: readonly VenueLiquidityProfile[] = [
      {
        exchange: 'binance',
        topAskPrice: 3200,
        topBidPrice: 3199,
        depthSize: 5.0,
        takerFeeBps: 4.0,
        makerFeeBps: 1.0,
      },
      {
        exchange: 'okx',
        topAskPrice: 3200.5,
        topBidPrice: 3198.5,
        depthSize: 5.0,
        takerFeeBps: 5.0,
        makerFeeBps: 1.5,
      },
      {
        exchange: 'bybit',
        topAskPrice: 3201.0,
        topBidPrice: 3198.0,
        depthSize: 4.0,
        takerFeeBps: 5.5,
        makerFeeBps: 2.0,
      },
    ];

    const executionPlan = coordinateParentOrderExecution(
      {
        clientOrderId: 'statarb-parent-001',
        symbol: 'ETH/USDT',
        side: 'buy',
        totalQuantity: riskDecision.adjustedQuantity,
        sliceCount: 4,
        durationMinutes: 4,
        jitterRatio: 0.15,
      },
      venues,
    );

    expect(executionPlan.parentOrderId).toBe('statarb-parent-001');
    expect(executionPlan.totalPlannedQuantity).toBe(2.0);
    expect(executionPlan.slices).toHaveLength(4);

    // Every slice should be safely routed across top venues
    for (const slice of executionPlan.slices) {
      expect(slice.targetQuantity).toBeCloseTo(0.5, 4);
      expect(slice.venueAllocations.length).toBeGreaterThan(0);
      expect(slice.venueAllocations[0].exchange).toBe('binance'); // Best effective price
    }
  });
});
