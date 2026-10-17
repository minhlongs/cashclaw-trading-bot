import { describe, it, expect } from 'vitest';
import { CorwinSchultzEngine } from '@/tree/quantlib/microstructure/corwin-schultz-engine';
import { AbdiRanaldoEngine } from '@/tree/quantlib/microstructure/abdi-ranaldo-engine';
import { LesmondLotEngine } from '@/tree/quantlib/liquidity/lesmond-lot-engine';
import { PastorStambaughEngine } from '@/tree/quantlib/liquidity/pastor-stambaugh-engine';
import { parseResearchHypothesis } from '@/tree/research/hypothesis/types';
import { tsMean, tsRank, decayLinear, signedPower } from '@/tree/research/alpha/zoo/operator-kernels';

describe('Triad v62 Golden Apex Suite Simulation', () => {
  it('orchestrates Corwin-Schultz, Abdi-Ranaldo, Lesmond LOT, Pastor-Stambaugh, and modularized research kernels', () => {
    // 1. Corwin & Schultz (2012) High-Low spread
    const cs = CorwinSchultzEngine.calculate({
      bars: [
        { high: 103.0, low: 97.0 },
        { high: 103.2, low: 97.1 },
        { high: 102.9, low: 96.9 },
        { high: 103.1, low: 97.2 },
      ],
    });
    expect(cs.estimatedSpread).toBeGreaterThan(0);

    // 2. Abdi & Ranaldo (2017) Close-High-Low spread
    const ar = AbdiRanaldoEngine.calculate({
      bars: [
        { high: 103.0, low: 97.0, close: 102.6 },
        { high: 103.2, low: 97.2, close: 97.5 },
        { high: 103.0, low: 97.0, close: 102.5 },
      ],
    });
    expect(ar.effectiveSpread).toBeGreaterThan(0);

    // 3. Lesmond, Ogden & Trzcinka (1999) LOT zero-return cost
    const lot = LesmondLotEngine.calculate({
      returns: [0, 0.015, 0, -0.012, 0.018, 0, -0.014, 0.011],
    });
    expect(lot.zeroReturnProportion).toBe(0.375);
    expect(lot.roundTripCost).toBeGreaterThan(0);

    // 4. Pastor & Stambaugh (2003) volume-induced return reversal
    const ps = PastorStambaughEngine.calculate({
      bars: [
        { assetReturn: 0.025, marketReturn: 0.003, dollarVolume: 8_000_000 },
        { assetReturn: -0.016, marketReturn: 0.001, dollarVolume: 7_500_000 },
        { assetReturn: 0.022, marketReturn: 0.002, dollarVolume: 9_000_000 },
        { assetReturn: -0.019, marketReturn: 0.001, dollarVolume: 8_200_000 },
      ],
    });
    expect(ps.gammaLiquidity).toBeLessThan(0);
    expect(ps.reversalStrength).toBeGreaterThan(0);

    // 5. Modularized hypothesis & zoo operator kernel verification
    const meanOut = tsMean([1, 2, 3, 4], 2);
    const rankOut = tsRank([1, 3, 2, 4], 3);
    const decayOut = decayLinear([2, 4, 6], 2);
    const powOut = signedPower([-4, 0, 9], 0.5);
    expect(meanOut[3]).toBe(3.5);
    expect(rankOut[3]).toBe(1);
    expect(decayOut[2]).toBeCloseTo((2 * 4 + 1 * 6) / 3, 5);
    expect(powOut).toEqual([-2, 0, 3]);

    const invalidHyp = parseResearchHypothesis({});
    expect(invalidHyp.ok).toBe(false);
  });
});
