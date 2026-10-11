import { describe, it, expect } from 'vitest';
import { computeGatheralBiarezConvexExecution } from '../../src/tree/quantlib/execution/gatheral-biarez-convex-engine';
import { computeBarclayWarnerStealth } from '../../src/tree/quantlib/microstructure/barclay-warner-stealth-engine';
import { generateSyntheticCandles, generateTrendingCandles } from '../../src/forest/alpha/integration/fixtures';

describe('Triad v49 Apex Multi-Domain Suite Cross-Domain Simulation', () => {
  it('simulates institutional execution under stealth-informed order flow and convex impact', () => {
    const candles = generateTrendingCandles(30, 'up');
    expect(candles.length).toBe(30);

    const stealthTrades = candles.map((c, i) => {
      const prev = i === 0 ? c.open : candles[i - 1].close;
      const dp = c.close - prev;
      return { size: c.volume, priceChange: dp };
    });

    const stealthAnalysis = computeBarclayWarnerStealth({
      trades: stealthTrades,
    });

    expect(stealthAnalysis.totalTrades).toBe(30);
    expect(['small', 'medium', 'large']).toContain(stealthAnalysis.dominantStealthBucket);

    const initialPrice = candles[candles.length - 1].close;
    const execution = computeGatheralBiarezConvexExecution({
      initialShares: 5000,
      initialPrice,
      timeHorizon: 1.0,
      numSteps: 10,
      convexExponent: 1.6,
      impactParam: 0.08,
      permImpactParam: 0.03,
    });

    expect(execution.trajectory.length).toBe(10);
    expect(execution.terminalShares).toBe(0);
    expect(execution.totalExecutionCost).toBeGreaterThan(0);
    expect(execution.averageExecutionPrice).toBeLessThanOrEqual(initialPrice);
  });
});
