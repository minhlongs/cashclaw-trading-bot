import { describe, expect, it } from 'vitest';
import { computeHubbertElasticityExecution } from '../../src/tree/quantlib/execution/hubbert-elasticity-engine';

describe('Hubbert (2012) Transient Liquidity Elasticity Engine', () => {
  it('correctly executes full inventory conservation across steps', () => {
    const res = computeHubbertElasticityExecution({
      totalShares: 10_000,
      numSteps: 5,
      elasticityAlpha: 0.36,
      baseResilience: 0.5,
      timeStep: 1.0,
      depthParameter: 10_000,
    });

    expect(res.trajectory).toHaveLength(5);
    const executedShares = res.trajectory.reduce((acc, step) => acc + step.tradeSize, 0);
    expect(executedShares).toBeCloseTo(10_000, 4);
    expect(res.trajectory[4].remainingShares).toBeCloseTo(0, 4);
  });

  it('demonstrates liquidity savings over immediate execution', () => {
    const res = computeHubbertElasticityExecution({
      totalShares: 5_000,
      numSteps: 4,
      elasticityAlpha: 0.2,
      baseResilience: 0.4,
      timeStep: 1.0,
    });

    expect(res.immediateCost).toBeGreaterThan(res.expectedCost);
    expect(res.liquiditySavings).toBeGreaterThan(0);
    expect(res.liquiditySavings).toBeCloseTo(res.immediateCost - res.expectedCost, 4);
  });

  it('reflects higher elasticity alpha scaling factor', () => {
    const lowAlpha = computeHubbertElasticityExecution({
      totalShares: 1_000,
      numSteps: 3,
      elasticityAlpha: 0.0,
      baseResilience: 0.1,
    });
    const highAlpha = computeHubbertElasticityExecution({
      totalShares: 1_000,
      numSteps: 3,
      elasticityAlpha: 0.75,
      baseResilience: 0.1,
    });

    expect(highAlpha.elasticityScalingFactor).toBeGreaterThan(lowAlpha.elasticityScalingFactor);
    expect(highAlpha.expectedCost).toBeGreaterThan(lowAlpha.expectedCost);
  });

  it('handles edge cases gracefully: single step and zero shares', () => {
    const single = computeHubbertElasticityExecution({
      totalShares: 2_500,
      numSteps: 1,
      elasticityAlpha: 0.1,
      baseResilience: 0.2,
    });
    expect(single.trajectory).toHaveLength(1);
    expect(single.trajectory[0].tradeSize).toBe(2_500);
    expect(single.trajectory[0].remainingShares).toBe(0);

    const zero = computeHubbertElasticityExecution({
      totalShares: 0,
      numSteps: 3,
      elasticityAlpha: 0.1,
      baseResilience: 0.2,
    });
    expect(zero.expectedCost).toBe(0);
    expect(zero.immediateCost).toBe(0);
  });
});
