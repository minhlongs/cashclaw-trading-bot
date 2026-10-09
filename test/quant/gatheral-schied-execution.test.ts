import { describe, expect, it } from 'vitest';
import { computeGatheralSchiedExecution } from '@/tree/quantlib/execution/gatheral-schied-engine';
import type { GatheralSchiedParams } from '@/tree/quantlib/execution/gatheral-schied-types';

describe('Gatheral-Schied-Slynko (2012) Transient Market Impact & Resilient Execution Engine', () => {
  const baseParams: GatheralSchiedParams = {
    initialInventory: 1000,
    initialPrice: 100,
    timeHorizon: 1.0,
    numSteps: 5,
    instantaneousImpact: 0.01,
    decayRate: 0.5,
  };

  it('guarantees no price manipulation or arbitrage under completely monotonic decay kernel', () => {
    const res = computeGatheralSchiedExecution(baseParams);
    expect(res.isNoArbitrageGuaranteed).toBe(true);
    expect(res.totalCost).toBeGreaterThan(0);
    expect(res.terminalInventory).toBe(0);
    expect(res.trajectory.length).toBe(5);
  });

  it('correctly tracks transient impact decay and step costs over time', () => {
    const res = computeGatheralSchiedExecution(baseParams);
    expect(res.trajectory[0]?.tradeSize).toBe(200);
    expect(res.trajectory[0]?.executionPrice).toBeLessThan(100);
    expect(res.vwapPrice).toBeLessThan(100);
    expect(res.terminalPrice).toBeLessThan(100);
    expect(res.priceReversionPath.length).toBe(5);
    // Price should revert towards initial price over time
    const lastRevert = res.priceReversionPath[4]!;
    const firstRevert = res.priceReversionPath[0]!;
    expect(lastRevert).toBeGreaterThan(firstRevert);
  });

  it('supports power-law memory decay kernels and maintains non-negative shortfall', () => {
    const powerLawParams: GatheralSchiedParams = {
      ...baseParams,
      powerLawAlpha: 0.5,
    };
    const res = computeGatheralSchiedExecution(powerLawParams);
    expect(res.isNoArbitrageGuaranteed).toBe(true);
    expect(res.totalCost).toBeGreaterThan(0);
    expect(res.vwapPrice).toBeGreaterThan(0);
  });

  it('handles zero initial inventory gracefully', () => {
    const res = computeGatheralSchiedExecution({ ...baseParams, initialInventory: 0 });
    expect(res.totalCost).toBe(0);
    expect(res.vwapPrice).toBe(100);
    expect(res.terminalInventory).toBe(0);
  });
});
