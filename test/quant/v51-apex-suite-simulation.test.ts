import { describe, it, expect } from 'vitest';
import { executeKonishiBrowne } from '../../src/tree/quantlib/execution/konishi-browne-engine';
import { computeStollSpread } from '../../src/tree/quantlib/microstructure/stoll-spread-engine';
import { compile, type CompilerContext } from '../../src/tree/research/alpha/compiler';
import { RuleBasedRegimeClassifier } from '../../src/tree/regime/classifier';
import { RegimeLabel } from '../../src/tree/regime/types';

describe('Triad v51 Golden Apex Multi-Domain Integration Simulation', () => {
  it('integrates Konishi & Browne execution, Stoll spread, modular AlphaCompiler, and RegimeClassifier', async () => {
    // 1. Konishi & Browne Execution
    const kbRes = executeKonishiBrowne({
      totalShares: 10_000,
      initialPrice: 50_000,
      volumeWeights: [0.2, 0.3, 0.3, 0.2],
      riskAversion: 0.05,
      volatility: 0.015,
    });
    expect(kbRes.schedule).toHaveLength(4);
    expect(kbRes.totalExecutionCost).toBeGreaterThan(0);
    expect(kbRes.effectiveVWAP).toBeGreaterThan(0);

    // 2. Stoll Spread Decomposition
    const stollRes = computeStollSpread({
      ticks: [
        { price: 50010, midpoint: 50000 },
        { price: 49990, midpoint: 50000 },
        { price: 50015, midpoint: 50005 },
        { price: 49985, midpoint: 49995 },
      ],
    });
    expect(stollRes.effectiveSpread).toBeGreaterThan(0);
    expect(stollRes.orderProcessingFraction + stollRes.adverseSelectionFraction + stollRes.inventoryHoldingFraction).toBeCloseTo(1.0, 5);

    // 3. Modular RegimeClassifier
    const classifier = new RuleBasedRegimeClassifier();
    const regimeRes = classifier.classify(
      {
        realizedVol: 0.02,
        atr: 150,
        trendStrength: 65,
        maSlope: 0.03,
        returnDispersion: 0.01,
        volumeAbnormality: 1.2,
      },
      { minCandles: 20, confidenceThreshold: 0.5, lookback: 20, minDuration: 1 },
    );
    expect(regimeRes.label).toBe(RegimeLabel.TREND_UP);
    expect(regimeRes.confidence).toBeGreaterThan(0.5);

    // 4. Modular AlphaCompiler
    const ctx: CompilerContext = {
      dataWindow: {
        earliestTimestamp: 1_000_000_000_000,
        latestTimestamp: 1_000_000_000_000 + 2000 * 3_600_000,
        barCount: 2000,
      },
    };
    const invalidHypothesis = { id: 'invalid-hyp' };
    const compileRes = await compile(invalidHypothesis, ctx);
    expect(compileRes.ok).toBe(false);
  });
});
