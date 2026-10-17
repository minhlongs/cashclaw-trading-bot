import { describe, it, expect } from 'vitest';
import { PastorStambaughEngine } from '@/tree/quantlib/liquidity/pastor-stambaugh-engine';
import type { PastorStambaughBar } from '@/tree/quantlib/liquidity/pastor-stambaugh-types';

describe('PastorStambaughEngine (2003 Signed-Volume Return Reversal Liquidity)', () => {
  const reversalBars: PastorStambaughBar[] = [
    { assetReturn: 0.03, marketReturn: 0.005, dollarVolume: 12_000_000 },
    { assetReturn: -0.018, marketReturn: 0.002, dollarVolume: 10_000_000 },
    { assetReturn: 0.025, marketReturn: 0.003, dollarVolume: 15_000_000 },
    { assetReturn: -0.022, marketReturn: 0.001, dollarVolume: 11_000_000 },
    { assetReturn: 0.028, marketReturn: 0.004, dollarVolume: 14_000_000 },
  ];

  it('detects negative gamma liquidity coefficient and positive reversal strength under order-flow bounce', () => {
    const engine = new PastorStambaughEngine();
    const res = engine.estimate(reversalBars);
    expect(res.gammaLiquidity).toBeLessThan(0);
    expect(res.reversalStrength).toBeGreaterThan(0);
    expect(res.transitionCount).toBe(4);
  });

  it('rejects fewer than 3 daily bars or negative dollar volume', () => {
    expect(() => PastorStambaughEngine.calculate({ bars: reversalBars.slice(0, 2) })).toThrow();
    expect(() =>
      PastorStambaughEngine.calculate({
        bars: [
          { assetReturn: 0.01, marketReturn: 0.0, dollarVolume: -100 },
          { assetReturn: -0.01, marketReturn: 0.0, dollarVolume: 100 },
          { assetReturn: 0.01, marketReturn: 0.0, dollarVolume: 100 },
        ],
      }),
    ).toThrow();
  });
});
