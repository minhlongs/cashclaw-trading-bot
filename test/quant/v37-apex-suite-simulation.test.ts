import { describe, it, expect } from 'vitest';
import { computeAlfonsiFruthExecution } from '../../src/tree/quantlib/execution/alfonsi-fruth-engine';
import { computeParlourOrderBook } from '../../src/tree/quantlib/microstructure/parlour-orderbook-engine';
import { attributeLongShortPrecise, attributeCosts } from '../../src/forest/alpha/cross-sectional-eval/attribution';
import { createJsonAdapter } from '../../src/forest/alpha/persistence/json-adapter';

describe('V37 Apex Suite Cross-Domain Quantitative Integration', () => {
  it('integrates Alfonsi-Fruth execution with Parlour order routing and attribution', () => {
    const ob = computeParlourOrderBook({
      queueDepthAhead: 4,
      arrivalIntensity: 5.0,
      cancellationRate: 0.1,
      tickSpread: 0.05,
      executionHorizonSec: 30,
    });

    expect(ob.recommendedOrderType).toBe('LIMIT');

    const exec = computeAlfonsiFruthExecution({
      initialInventory: 500,
      initialPrice: 150,
      timeHorizon: 5,
      numSteps: 5,
      resilienceSpeed: 0.8,
      impactFactor: 0.02,
      shapeExponent: 1.0,
    });

    expect(exec.terminalInventory).toBe(0);
    expect(exec.vwapPrice).toBeLessThan(150);

    const costAttr = attributeCosts([
      {
        timestamp: 1,
        grossReturn: 0.02,
        costPct: 0.001,
        netReturn: 0.019,
        turnover: 0.1,
        grossExposure: 1.0,
        netExposure: 1.0,
        weights: { BTC: 1 },
      },
    ]);
    expect(costAttr.fees).toBeGreaterThan(0);
    expect(costAttr.slippage).toBeGreaterThan(0);

    const lsAttr = attributeLongShortPrecise([
      { weights: { BTC: 0.5, ETH: -0.5 }, assetReturns: { BTC: 0.02, ETH: -0.01 } },
    ]);
    expect(lsAttr.longSidePnl).toBeCloseTo(0.01, 5);
    expect(lsAttr.shortSidePnl).toBeCloseTo(0.005, 5);

    const adapter = createJsonAdapter('test-tmp-v37');
    expect(adapter).toBeDefined();
  });
});
