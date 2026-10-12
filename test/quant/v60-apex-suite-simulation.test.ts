import { describe, it, expect } from 'vitest';
import { GarmanKlassVolatilityEngine } from '@/tree/quantlib/volatility/garman-klass-volatility-engine';
import { ParkinsonVolatilityEngine } from '@/tree/quantlib/volatility/parkinson-volatility-engine';
import { YangZhangVolatilityEngine } from '@/tree/quantlib/volatility/yang-zhang-volatility-engine';
import { BessembinderKaufmanEngine } from '@/tree/quantlib/microstructure/bessembinder-kaufman-engine';
import type { OhlcBar } from '@/tree/quantlib/volatility/garman-klass-volatility-types';
import type { TradeQuotePair } from '@/tree/quantlib/microstructure/bessembinder-kaufman-types';

describe('Triad v60 Golden Apex Suite Simulation', () => {
  it('orchestrates volatility estimation and microstructure execution quality analysis', () => {
    // Generate synthetic market price path with intraday ranges and overnight gaps
    const bars: OhlcBar[] = [
      { open: 100.0, high: 104.5, low: 98.2, close: 103.0 },
      { open: 105.0, high: 108.0, low: 103.5, close: 106.2 },
      { open: 104.8, high: 109.5, low: 102.0, close: 107.5 },
      { open: 108.0, high: 111.0, low: 106.5, close: 109.8 },
    ];

    const gk = GarmanKlassVolatilityEngine.calculate({ bars, annualizationFactor: 365 });
    const parkinson = ParkinsonVolatilityEngine.calculate({ bars, annualizationFactor: 365 });
    const yz = YangZhangVolatilityEngine.calculate({ bars, annualizationFactor: 365 });

    expect(gk.annualizedVolatility).toBeGreaterThan(0);
    expect(parkinson.annualizedVolatility).toBeGreaterThan(0);
    expect(yz.annualizedVolatility).toBeGreaterThan(0);
    expect(yz.overnightVariance).toBeGreaterThan(0);

    // Trade quote decomposition
    const tradePairs: TradeQuotePair[] = [
      { tradePrice: 103.5, tradeSign: 1, prevailingMid: 103.0, futureMid: 103.2 },
      { tradePrice: 106.5, tradeSign: 1, prevailingMid: 106.0, futureMid: 106.1 },
      { tradePrice: 107.0, tradeSign: -1, prevailingMid: 107.5, futureMid: 107.2 },
    ];

    const bk = BessembinderKaufmanEngine.calculate({ pairs: tradePairs });
    expect(bk.effectiveHalfSpread).toBeCloseTo(bk.realizedHalfSpread + bk.priceImpact, 5);
    expect(bk.pairCount).toBe(3);
  });
});
