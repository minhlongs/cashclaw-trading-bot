import { describe, expect, it, vi } from 'vitest';
import { computeQuantExecutionPlan } from './quantlib-execution-sizer';
import { executeDcaOrder, executeQuantDcaOrder } from './volatility-dca-execution';

describe('computeQuantExecutionPlan', () => {
  it('computes balanced execution trajectory under normal volatility with default parameters', () => {
    const plan = computeQuantExecutionPlan({
      totalQuantity: 10,
      volatilityPct: 3,
    });

    expect(plan.strategyClass).toBe('BALANCED_AC_TRAJECTORY');
    expect(plan.isThrottled).toBe(false);
    expect(plan.preferPassiveMaker).toBe(false);
    expect(plan.adjustedHorizonSeconds).toBe(20);
    expect(plan.sliceQuantity).toBeGreaterThan(2.5);
    expect(plan.sliceQuantity).toBeLessThan(10);
    expect(plan.urgencyKappa).toBeGreaterThan(0);
    expect(plan.expectedShortfallCost).toBeGreaterThan(0);
  });

  it('classifies URGENT_FRONT_LOADED when riskAversionLambda is high', () => {
    const plan = computeQuantExecutionPlan({
      totalQuantity: 20,
      volatilityPct: 12,
      riskAversionLambda: 0.8,
      horizonSteps: 4,
      stepSeconds: 10,
    });

    expect(plan.strategyClass).toBe('URGENT_FRONT_LOADED');
    expect(plan.firstSliceRatio).toBeGreaterThanOrEqual(0.25 * 1.35);
    expect(plan.sliceQuantity).toBeCloseTo(20 * plan.firstSliceRatio, 6);
  });

  it('classifies PASSIVE_TWAP_LIMIT when riskAversionLambda is very low', () => {
    const plan = computeQuantExecutionPlan({
      totalQuantity: 8,
      volatilityPct: 0.5,
      riskAversionLambda: 0,
      horizonSteps: 4,
      stepSeconds: 5,
    });

    expect(plan.strategyClass).toBe('PASSIVE_TWAP_LIMIT');
    expect(plan.firstSliceRatio).toBeCloseTo(0.25, 4);
    expect(plan.sliceQuantity).toBeCloseTo(2, 6);
  });

  it('throttles execution horizon at vpinCdf = 0.90 and caps passive maker slice at vpinCdf = 0.98', () => {
    const moderate = computeQuantExecutionPlan({
      totalQuantity: 12,
      volatilityPct: 10,
      vpinCdf: 0.9,
      riskAversionLambda: 0.5,
    });

    expect(moderate.isThrottled).toBe(true);
    expect(moderate.preferPassiveMaker).toBe(false);
    expect(moderate.adjustedHorizonSeconds).toBeGreaterThan(20);

    const critical = computeQuantExecutionPlan({
      totalQuantity: 12,
      volatilityPct: 10,
      vpinCdf: 0.98,
      riskAversionLambda: 0.5,
      horizonSteps: 4,
    });

    expect(critical.isThrottled).toBe(true);
    expect(critical.preferPassiveMaker).toBe(true);
    expect(critical.firstSliceRatio).toBeLessThanOrEqual(0.25);
    expect(critical.sliceQuantity).toBeCloseTo(3, 6);
  });
});

describe('executeQuantDcaOrder and executeDcaOrder', () => {
  it('dispatches paper limit order with optimal slice quantity and logs telemetry', async () => {
    const onLog = vi.fn();
    const placeOrder = vi.fn().mockResolvedValue({ id: 'ord-q1', status: 'filled' });

    const plan = await executeQuantDcaOrder(
      { onLog, placeOrder },
      'BTC/USDT',
      'binance',
      'buy',
      50000,
      4,
      { volatilityPct: 15, vpinCdf: 0.4 },
    );

    expect(onLog).toHaveBeenCalledWith(
      `VolatilityDCA quant execution: class=${plan.strategyClass} slice=${plan.sliceQuantity} throttled=false`,
    );
    expect(placeOrder).toHaveBeenCalledWith({
      symbol: 'BTC/USDT',
      exchange: 'binance',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: plan.sliceQuantity,
      timeInForce: 'GTC',
    });
  });

  it('handles missing placeOrder and error branches in executeDcaOrder', async () => {
    const onLog = vi.fn();
    await executeDcaOrder({ onLog }, 'BTC/USDT', 'binance', 'buy', 50000, 1);
    expect(onLog).not.toHaveBeenCalled();

    const failOrder = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce('raw');
    await executeDcaOrder({ onLog, placeOrder: failOrder }, 'BTC/USDT', 'binance', 'buy', 50000, 1);
    await executeDcaOrder({ onLog, placeOrder: failOrder }, 'BTC/USDT', 'binance', 'sell', 50000, 1);
    expect(onLog).toHaveBeenCalledWith('VolatilityDCA buy order failed: timeout');
    expect(onLog).toHaveBeenCalledWith('VolatilityDCA sell order failed: unknown');
  });
});
