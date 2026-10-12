import { describe, it, expect } from 'vitest';
import { AdmatiPfleidererEngine } from '../../src/tree/quantlib/microstructure/admati-pfleiderer-engine';

describe('Admati & Pfleiderer (1988) Volume Clustering & Sunshine Trading Engine', () => {
  it('detects volume clustering peak and transaction cost dynamics', () => {
    const config = {
      fundamentalVolatility: 0.02,
      fixedExecutionCost: 0.001,
      sunshineDisclosureBonus: 0.0002,
      periods: [
        { periodIndex: 1, nondiscretionaryVolume: 100, discretionaryTraders: 5, informedTraders: 2 },
        { periodIndex: 2, nondiscretionaryVolume: 500, discretionaryTraders: 50, informedTraders: 10 },
        { periodIndex: 3, nondiscretionaryVolume: 150, discretionaryTraders: 8, informedTraders: 3 },
      ],
    };
    const res = AdmatiPfleidererEngine.analyzeIntradayClustering(config);
    expect(res.periods.length).toBe(3);
    expect(res.highestLiquidityPeriod).toBe(2);
    expect(res.periods[1].isClusteredLiquidityPeak).toBe(true);
    expect(res.intradayCostDispersion).toBeGreaterThanOrEqual(0);
  });

  it('throws error when periods array is empty', () => {
    expect(() => {
      AdmatiPfleidererEngine.analyzeIntradayClustering({
        fundamentalVolatility: 0.02,
        fixedExecutionCost: 0.001,
        sunshineDisclosureBonus: 0,
        periods: [],
      });
    }).toThrow('At least one period required');
  });
});
