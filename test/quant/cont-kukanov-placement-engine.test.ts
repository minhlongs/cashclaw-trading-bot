import { describe, it, expect } from 'vitest';
import { ContKukanovPlacementEngine } from '../../src/tree/quantlib/microstructure/cont-kukanov-placement-engine';

describe('Cont-Kukanov (2014) Optimal Order Placement Engine', () => {
  it('handles zero quantity boundary gracefully', () => {
    const engine = new ContKukanovPlacementEngine({ bidAskSpread: 0.001 });
    const result = engine.computeOptimalPlacement(0);
    expect(result.totalOrderQuantity).toBe(0);
    expect(result.optimalLimitQuantity).toBe(0);
    expect(result.optimalMarketQuantity).toBe(0);
    expect(result.limitRatio).toBe(0);
  });

  it('allocates positive limit proportion when half-spread exceeds fees', () => {
    const engine = new ContKukanovPlacementEngine({
      bidAskSpread: 0.002, // 20 bps spread
      limitOrderFeeRate: -0.0001, // Maker rebate
      marketOrderFeeRate: 0.0005, // 5 bps taker fee
      adverseSelectionCost: 0.0001,
      nonExecutionPenalty: 0.0002,
      fillDecayRate: 0.02,
    });

    const result = engine.computeOptimalPlacement(10);
    expect(result.optimalLimitQuantity).toBeGreaterThan(0);
    expect(result.optimalLimitQuantity + result.optimalMarketQuantity).toBeCloseTo(10, 4);
    expect(result.makerSavingsBps).toBeGreaterThan(0);
    expect(result.expectedFillProbability).toBeGreaterThan(0);
  });

  it('favors market orders when adverse selection and penalties dominate', () => {
    const engine = new ContKukanovPlacementEngine({
      bidAskSpread: 0.0002, // tight spread
      limitOrderFeeRate: 0.0002,
      marketOrderFeeRate: 0.0003,
      adverseSelectionCost: 0.002, // severe toxicity
      nonExecutionPenalty: 0.005, // heavy penalty
      fillDecayRate: 0.5,
    });

    const result = engine.computeOptimalPlacement(10);
    expect(result.optimalMarketQuantity).toBeGreaterThanOrEqual(result.optimalLimitQuantity);
  });
});
