import { describe, it, expect } from 'vitest';
import { interceptOrderExecution } from './fleet-risk-interceptor';
import { coordinateParentOrderExecution } from './sor-execution-coordinator';
import type { VenueLiquidityProfile } from '../smart/smart-execution-types';

describe('FleetRiskInterceptor', () => {
  it('blocks execution when requested quantity is non-positive', () => {
    const decision = interceptOrderExecution(0, 100_000, 100_000);
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe('block_emergency_pause');
    expect(decision.adjustedQuantity).toBe(0);
  });

  it('allows full execution under normal portfolio health', () => {
    const decision = interceptOrderExecution(2.5, 98_000, 100_000);
    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe('execute');
    expect(decision.adjustedQuantity).toBe(2.5);
    expect(decision.reason).toBeNull();
  });

  it('throttles quantity by half when warning drawdown threshold is reached', () => {
    const decision = interceptOrderExecution(2.0, 90_000, 100_000, 0.15, 0.08); // 10% DD
    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe('throttle_half_size');
    expect(decision.adjustedQuantity).toBe(1.0);
    expect(decision.reason).toContain('warning threshold');
  });

  it('triggers emergency pause when maximum drawdown is breached', () => {
    const decision = interceptOrderExecution(2.0, 80_000, 100_000, 0.15, 0.08); // 20% DD
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe('block_emergency_pause');
    expect(decision.adjustedQuantity).toBe(0);
    expect(decision.reason).toContain('exceeded emergency ceiling');
  });
});

describe('SorExecutionCoordinator', () => {
  const venues: readonly VenueLiquidityProfile[] = [
    {
      exchange: 'binance',
      topAskPrice: 50_000,
      topBidPrice: 49_990,
      depthSize: 5.0,
      takerFeeBps: 4.0,
      makerFeeBps: 1.0,
    },
    {
      exchange: 'okx',
      topAskPrice: 50_010,
      topBidPrice: 49_980,
      depthSize: 5.0,
      takerFeeBps: 5.0,
      makerFeeBps: 1.5,
    },
  ];

  it('coordinates parent order into TWAP slices and routes child orders', () => {
    const plan = coordinateParentOrderExecution(
      {
        clientOrderId: 'parent-123',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalQuantity: 3.0,
        sliceCount: 3,
        durationMinutes: 3,
      },
      venues,
    );

    expect(plan.parentOrderId).toBe('parent-123');
    expect(plan.slices).toHaveLength(3);
    expect(plan.totalPlannedQuantity).toBe(3.0);
    expect(plan.slices[0].venueAllocations.length).toBeGreaterThan(0);
    expect(plan.slices[0].venueAllocations[0].exchange).toBe('binance');
  });
});
