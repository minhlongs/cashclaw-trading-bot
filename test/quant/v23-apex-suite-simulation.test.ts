import { describe, expect, it } from 'vitest';
import { computeBouchaudImpact } from '../../src/tree/quantlib/impact/bouchaud-propagator-engine';
import { computeGlostenHarrisDecomposition } from '../../src/tree/quantlib/microstructure/glosten-harris-spread-engine';
import {
  returnsIndicator,
  volumeZScoreIndicator,
  realizedVolatilityIndicator,
} from '../../src/tree/alpha/indicators-statistical';
import {
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
} from '../../src/forest/alpha/gate/robustness-checks-invariance';
import type { IndicatorCandle } from '../../src/tree/alpha/indicator-types';

describe('Triad v23 Apex Suite Cross-Domain Simulation', () => {
  it('integrates Bouchaud impact, Glosten-Harris spread, statistical indicators, and gate checks', () => {
    // 1. Order flow sequence & Bouchaud Propagator Impact
    const orderFlow = [
      { orderSign: 1 as const, volume: 100 },
      { orderSign: 1 as const, volume: 150 },
      { orderSign: -1 as const, volume: 80 },
      { orderSign: 1 as const, volume: 120 },
    ];
    const impactResult = computeBouchaudImpact(orderFlow, { gamma0: 0.01, tau0: 5, beta: 0.3 });
    expect(impactResult.peakImpact).toBeGreaterThan(0);
    expect(impactResult.impactSeries.length).toBe(4);

    // 2. Market microstructure tick series & Glosten-Harris decomposition
    const ticks = [
      { price: 100.0, tradeDirection: 1 as const },
      { price: 100.1, tradeDirection: 1 as const },
      { price: 100.05, tradeDirection: -1 as const },
      { price: 100.18, tradeDirection: 1 as const },
      { price: 100.12, tradeDirection: -1 as const },
    ];
    const spreadResult = computeGlostenHarrisDecomposition(ticks);
    expect(spreadResult.spread).toBeGreaterThan(0);
    expect(spreadResult.adverseSelectionShare).toBeGreaterThanOrEqual(0);
    expect(spreadResult.orderProcessingShare).toBeGreaterThanOrEqual(0);

    // 3. Statistical indicators from modularized alpha indicators
    const candles: IndicatorCandle[] = [
      { timestamp: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { timestamp: 2000, open: 101, high: 103, low: 100, close: 102, volume: 1200 },
      { timestamp: 3000, open: 102, high: 104, low: 101, close: 103, volume: 1500 },
      { timestamp: 4000, open: 103, high: 105, low: 102, close: 104, volume: 1800 },
    ];

    const retResult = returnsIndicator(candles, 1, '1h');
    expect(retResult.value).toBeCloseTo(0.0097, 3);

    const volZResult = volumeZScoreIndicator(candles, 3, '1h');
    expect(volZResult.value).toBeGreaterThan(0);

    const rVolResult = realizedVolatilityIndicator(candles, 2, '1h');
    expect(rVolResult.value).toBeGreaterThan(0);

    // 4. Robustness checks from modularized gate
    const leakageCheck = checkLeakageInvariance(0);
    expect(leakageCheck.passed).toBe(true);

    const windowCheck = checkNoSingleWindowDependency([100, 120, 90, 110], 0.5);
    expect(windowCheck.passed).toBe(true);
  });
});
